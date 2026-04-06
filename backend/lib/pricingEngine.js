/**
 * Rule-based pricing engine — priority tiers, stacking rules, best-price mode.
 * Pure functions; DB loads rules separately.
 */

const TIER_WEIGHT = {
    flash: 0,
    seasonal: 1,
    product: 2,
    category: 3,
    coupon: 4
};

const DEFAULT_TIER_ORDER = ['flash', 'seasonal', 'product', 'category', 'coupon'];

function num(x, d = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : d;
}

function parseDate(d) {
    if (d == null) return null;
    if (d instanceof Date) return d;
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? null : t;
}

function isWithinSchedule(rule, now) {
    const s = parseDate(rule.starts_at);
    const e = parseDate(rule.ends_at);
    if (s && now < s) return false;
    if (e && now > e) return false;
    return true;
}

function isRuleApplicable(rule, product, categoryId, now) {
    if (!rule || !rule.is_active) return false;
    if (!isWithinSchedule(rule, now)) return false;
    const pid = product && product.id != null ? Number(product.id) : null;
    const cid = categoryId != null ? Number(categoryId) : null;
    if (rule.scope === 'product') {
        return rule.product_id != null && Number(rule.product_id) === pid;
    }
    if (rule.scope === 'category') {
        return rule.category_id != null && cid != null && Number(rule.category_id) === cid;
    }
    if (rule.scope === 'sitewide') return true;
    return false;
}

function applyRuleToPrice(price, rule, quantity = 1) {
    const p = Math.max(0, num(price));
    const dt = rule.discount_type || 'percent';
    if (dt === 'percent') {
        const off = Math.min(100, Math.max(0, num(rule.percent_off)));
        return Math.max(0, roundMoney(p * (1 - off / 100)));
    }
    if (dt === 'fixed') {
        const off = Math.max(0, num(rule.fixed_off));
        return Math.max(0, roundMoney(p - off));
    }
    if (dt === 'bogo') {
        let bj = rule.bogo_json;
        if (typeof bj === 'string') {
            try {
                bj = JSON.parse(bj);
            } catch (_) {
                bj = null;
            }
        }
        const buy = Math.max(1, parseInt(bj && bj.buy, 10) || 2);
        const get = Math.max(0, parseInt(bj && bj.get, 10) || 1);
        const getDisc = Math.min(100, Math.max(0, num(bj && bj.getDiscountPercent, 100)));
        const bundle = buy + get;
        if (quantity < bundle) return p;
        const bundles = Math.floor(quantity / bundle);
        const remainder = quantity % bundle;
        const payFull = bundles * buy * p + remainder * p;
        const freeValue = bundles * get * p * (getDisc / 100);
        const totalAfter = Math.max(0, payFull - freeValue);
        return roundMoney(totalAfter / quantity);
    }
    return p;
}

function roundMoney(x) {
    return Math.round(x * 100) / 100;
}

function sortRulesByTier(rules, tierOrder) {
    const order = Array.isArray(tierOrder) && tierOrder.length ? tierOrder : DEFAULT_TIER_ORDER;
    const idx = (t) => {
        const i = order.indexOf(t);
        return i === -1 ? 99 : i;
    };
    return [...rules].sort((a, b) => {
        const ta = idx(a.tier || 'product');
        const tb = idx(b.tier || 'product');
        if (ta !== tb) return ta - tb;
        return num(a.rule_priority, 100) - num(b.rule_priority, 100);
    });
}

/**
 * @param {object} opts
 * @param {object} opts.product — row from DB
 * @param {number|null} opts.categoryId
 * @param {object[]} opts.rules — active discount_rules rows
 * @param {object} opts.settings — pricing_engine_settings row
 * @param {number} opts.quantity
 * @param {object|null} opts.couponRule — optional matched coupon rule (tier coupon)
 */
function computeFinalPricing(opts) {
    const { product, categoryId, rules, settings, quantity = 1, couponRule = null } = opts;
    const now = opts.now || new Date();
    const base = num(product.price != null ? product.price : product.base_price, 0);
    const legacySale = product.sale_price != null ? num(product.sale_price) : null;
    const legacyLow = legacySale != null && legacySale < base ? legacySale : base;

    const applicable = (rules || []).filter((r) => isRuleApplicable(r, product, categoryId, now));
    let withCoupon = applicable;
    if (couponRule && isRuleApplicable(couponRule, product, categoryId, now)) {
        withCoupon = [...applicable, couponRule];
    }

    const resolution = settings && settings.resolution_mode === 'priority' ? 'priority' : 'best_price';
    const allowStack = !!(settings && settings.allow_stack);
    let tierOrder = DEFAULT_TIER_ORDER;
    try {
        if (settings && settings.tier_order) {
            const t = typeof settings.tier_order === 'string' ? JSON.parse(settings.tier_order) : settings.tier_order;
            if (Array.isArray(t) && t.length) tierOrder = t;
        }
    } catch (_) {}

    const breakdown = [];
    let finalPrice = legacyLow;

    if (withCoupon.length === 0) {
        return {
            base_price: base,
            compare_at_price: base,
            sale_price: legacyLow < base ? legacyLow : null,
            final_price: legacyLow,
            savings: roundMoney(base - legacyLow),
            savings_percent: base > 0 ? roundMoney(((base - legacyLow) / base) * 100) : 0,
            breakdown,
            badge: legacyLow < base ? 'Sale' : null,
            tier: null,
            bogo_label: null,
            engine: 'legacy'
        };
    }

    const sorted = sortRulesByTier(withCoupon, tierOrder);

    if (resolution === 'best_price') {
        let best = legacyLow;
        let bestRule = null;
        for (const r of sorted) {
            const candidate = applyRuleToPrice(base, r, quantity);
            if (candidate < best) {
                best = candidate;
                bestRule = r;
            }
        }
        finalPrice = Math.min(best, legacyLow);
        if (bestRule) {
            breakdown.push({
                rule_id: bestRule.id,
                tier: bestRule.tier,
                type: bestRule.discount_type,
                label: describeRule(bestRule)
            });
        }
    } else {
        let price = base;
        let applied = 0;
        for (let i = 0; i < sorted.length; i++) {
            const r = sorted[i];
            if (i > 0 && !allowStack) break;
            if (i > 0 && !sorted[i - 1].stackable && !r.stackable) break;
            price = applyRuleToPrice(price, r, quantity);
            breakdown.push({
                rule_id: r.id,
                tier: r.tier,
                type: r.discount_type,
                label: describeRule(r)
            });
            applied++;
            if (!allowStack && applied >= 1) break;
        }
        finalPrice = Math.min(price, legacyLow);
    }

    finalPrice = roundMoney(Math.min(finalPrice, legacyLow));

    const bogoRule = sorted.find((r) => r.discount_type === 'bogo');
    return {
        base_price: base,
        compare_at_price: base,
        sale_price: finalPrice < base ? finalPrice : null,
        final_price: finalPrice,
        savings: roundMoney(base - finalPrice),
        savings_percent: base > 0 ? roundMoney(((base - finalPrice) / base) * 100) : 0,
        breakdown,
        badge: pickBadge(sorted, finalPrice, base),
        tier: sorted[0] && sorted[0].tier,
        bogo_label: bogoRule ? describeBogo(bogoRule) : null,
        engine: 'discount_engine'
    };
}

function describeRule(r) {
    if (r.discount_type === 'percent') return `${num(r.percent_off)}% off`;
    if (r.discount_type === 'fixed') return `LKR ${num(r.fixed_off)} off`;
    return describeBogo(r) || 'Special offer';
}

function describeBogo(r) {
    let bj = r.bogo_json;
    if (typeof bj === 'string') {
        try {
            bj = JSON.parse(bj);
        } catch (_) {
            bj = null;
        }
    }
    if (!bj) return 'BOGO';
    const b = parseInt(bj.buy, 10) || 2;
    const g = parseInt(bj.get, 10) || 1;
    return `Buy ${b} Get ${g}`;
}

function pickBadge(rules, finalPrice, base) {
    if (finalPrice >= base) return null;
    const flash = rules.find((r) => r.tier === 'flash');
    if (flash) return 'Flash Sale';
    const seasonal = rules.find((r) => r.tier === 'seasonal');
    if (seasonal) return 'Seasonal';
    return 'Offer';
}

module.exports = {
    computeFinalPricing,
    isRuleApplicable,
    sortRulesByTier,
    applyRuleToPrice,
    TIER_WEIGHT,
    DEFAULT_TIER_ORDER
};
