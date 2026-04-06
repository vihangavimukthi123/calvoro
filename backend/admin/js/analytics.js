/**
 * Admin Analytics – BI dashboard: fetch API, render charts and tables.
 */
(function () {
    'use strict';

    const base = '/api/admin/analytics';
    let dateFrom = '';
    let dateTo = '';
    let chartMonthly = null;
    let chartAnnual = null;
    let chartBreakdown = null;
    let chartOrdersStatus = null;

    function getRange() {
        const f = document.getElementById('dateFrom');
        const t = document.getElementById('dateTo');
        dateFrom = (f && f.value) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        dateTo = (t && t.value) || new Date().toISOString().slice(0, 10);
        if (f) f.value = dateFrom;
        if (t) t.value = dateTo;
        return { from: dateFrom, to: dateTo };
    }

    function getChartColors(isDark) {
        const bg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
        return {
            blue: 'rgb(102, 126, 234)',
            green: 'rgb(72, 187, 120)',
            orange: 'rgb(237, 137, 54)',
            red: 'rgb(245, 101, 101)',
            purple: 'rgb(159, 122, 234)',
            grid: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            text: isDark ? '#e2e8f0' : '#4a5568'
        };
    }

    function isDark() {
        return document.body.getAttribute('data-theme') === 'dark';
    }

    async function api(path, params = {}) {
        const q = new URLSearchParams(params).toString();
        const url = q ? base + path + '?' + q : base + path;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
    }

    function fmtCurrency(n) {
        return 'LKR ' + (Number(n) || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 });
    }

    async function loadKpis() {
        const range = getRange();
        try {
            const [metrics, aov, visitors] = await Promise.all([
                api('/metrics/orders', range),
                api('/metrics/aov', range),
                api('/realtime/visitors')
            ]);
            const rev = (metrics.total && aov.totalRevenue !== undefined) ? aov.totalRevenue : (metrics.revenue || 0);
            document.getElementById('kpiRevenue').textContent = fmtCurrency(rev);
            document.getElementById('kpiOrders').textContent = (metrics.total || 0).toLocaleString();
            document.getElementById('kpiAov').textContent = fmtCurrency(aov.aov || 0);
            document.getElementById('kpiVisitors').textContent = (visitors.count != null ? visitors.count : '—').toString();
        } catch (e) {
            document.getElementById('kpiRevenue').textContent = '—';
            document.getElementById('kpiOrders').textContent = '—';
            document.getElementById('kpiAov').textContent = '—';
            document.getElementById('kpiVisitors').textContent = '—';
        }
    }

    async function loadMonthlyChart() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        try {
            const data = await api('/sales/monthly', { year, month });
            const labels = (data.data || []).map(d => d.date);
            const rev = (data.data || []).map(d => d.revenue);
            const orders = (data.data || []).map(d => d.order_count);
            const c = getChartColors(isDark());
            if (chartMonthly) chartMonthly.destroy();
            chartMonthly = new Chart(document.getElementById('chartMonthly'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'Revenue', data: rev, borderColor: c.blue, backgroundColor: c.blue + '33', fill: true, yAxisID: 'y' },
                        { label: 'Orders', data: orders, borderColor: c.green, backgroundColor: c.green + '33', fill: true, yAxisID: 'y1' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { type: 'linear', grid: { color: c.grid }, ticks: { color: c.text, callback: v => fmtCurrency(v) } },
                        y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { color: c.text } },
                        x: { grid: { color: c.grid }, ticks: { color: c.text, maxRotation: 45 } }
                    },
                    plugins: { legend: { labels: { color: c.text } } }
                }
            });
        } catch (e) {
            console.error(e);
        }
    }

    async function loadAnnualChart() {
        const now = new Date();
        const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()].filter(y => y >= 2020);
        try {
            const data = await api('/sales/annual', { years: years.join(',') });
            const labels = (data || []).map(d => d.year);
            const rev = (data || []).map(d => d.revenue);
            const c = getChartColors(isDark());
            if (chartAnnual) chartAnnual.destroy();
            chartAnnual = new Chart(document.getElementById('chartAnnual'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ label: 'Revenue', data: rev, backgroundColor: [c.blue, c.green, c.purple].slice(0, labels.length) }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { grid: { color: c.grid }, ticks: { color: c.text, callback: v => fmtCurrency(v) } },
                        x: { grid: { color: c.grid }, ticks: { color: c.text } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        } catch (e) {
            console.error(e);
        }
    }

    async function loadBreakdownChart() {
        const range = getRange();
        try {
            const data = await api('/sales/breakdown', { ...range, groupBy: 'category' });
            const arr = (data.data || []).slice(0, 10);
            const labels = arr.map(d => d.category_name || 'Uncategorized');
            const rev = arr.map(d => d.revenue);
            const c = getChartColors(isDark());
            if (chartBreakdown) chartBreakdown.destroy();
            chartBreakdown = new Chart(document.getElementById('chartBreakdown'), {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{ data: rev, backgroundColor: [c.blue, c.green, c.orange, c.purple, c.red, '#48bb78', '#4299e1', '#ed8936', '#9f7aea', '#fc8181'] }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right', labels: { color: c.text } } }
                }
            });
        } catch (e) {
            console.error(e);
        }
    }

    async function loadOrdersStatusChart() {
        const range = getRange();
        try {
            const data = await api('/metrics/orders', range);
            const labels = ['Completed', 'Pending', 'Cancelled'];
            const values = [data.completed || 0, data.pending || 0, data.cancelled || 0];
            const c = getChartColors(isDark());
            if (chartOrdersStatus) chartOrdersStatus.destroy();
            chartOrdersStatus = new Chart(document.getElementById('chartOrdersStatus'), {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{ data: values, backgroundColor: [c.green, c.orange, c.red] }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: c.text } } }
                }
            });
        } catch (e) {
            console.error(e);
        }
    }

    function fillTable(id, rows, cols) {
        const tbody = document.querySelector('#' + id + ' tbody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="' + cols.length + '" class="text-center">No data</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(r => '<tr>' + cols.map(c => '<td>' + (c(r) || '—') + '</td>').join('') + '</tr>').join('');
    }

    async function loadTables() {
        const range = getRange();
        try {
            const [topSold, lowStock, topCust, searchTop, searchNo, recent, inv, custTotal, newCust, refund, aov] = await Promise.all([
                api('/products/top-sold', { ...range, limit: 10 }),
                api('/products/low-stock', { threshold: 10 }),
                api('/customers/top', { ...range, limit: 10 }),
                api('/behavior/search-top', { ...range, limit: 10 }),
                api('/behavior/search-no-results', { ...range, limit: 10 }),
                api('/realtime/orders', { limit: 10 }),
                api('/products/inventory-value'),
                api('/customers/total'),
                api('/customers/new', range),
                api('/metrics/refund-rate', range),
                api('/metrics/aov', range)
            ]);

            fillTable('tableTopSold', Array.isArray(topSold) ? topSold : [], [
                r => r.product_name || r.name || '—',
                r => (r.total_quantity || r.quantity || 0).toLocaleString(),
                r => fmtCurrency(r.revenue)
            ]);
            fillTable('tableLowStock', Array.isArray(lowStock) ? lowStock : [], [
                r => r.name || '—',
                r => (r.stock != null ? r.stock : '—').toString()
            ]);
            fillTable('tableTopCustomers', (topCust.data || topCust) || [], [
                r => (r.first_name || '') + ' ' + (r.last_name || '') || r.email || '—',
                r => (r.order_count || 0).toLocaleString(),
                r => fmtCurrency(r.total_spent)
            ]);
            fillTable('tableSearchTop', Array.isArray(searchTop) ? searchTop : [], [
                r => (r.keyword || '—').toString(),
                r => (r.search_count || 0).toLocaleString()
            ]);
            fillTable('tableSearchNoResults', Array.isArray(searchNo) ? searchNo : [], [
                r => (r.keyword || '—').toString(),
                r => (r.search_count || 0).toLocaleString()
            ]);
            fillTable('tableRecentOrders', Array.isArray(recent) ? recent : [], [
                r => '#' + (r.order_number || r.id),
                r => fmtCurrency(r.total),
                r => (r.status || '—')
            ]);

            document.getElementById('inventoryValue').textContent = inv && inv.total_value != null ? fmtCurrency(inv.total_value) + ' (' + (inv.product_count || 0) + ' products)' : '—';
            document.getElementById('totalCustomers').textContent = (custTotal && custTotal.total != null ? custTotal.total : '—').toString();
            document.getElementById('newCustomers').textContent = (newCust && newCust.count != null ? newCust.count + ' new in period' : '—');
            document.getElementById('refundRate').textContent = (refund && refund.rate != null ? refund.rate.toFixed(1) + '%' : '—');
            document.getElementById('aovDetail').textContent = aov && aov.aov != null ? 'AOV ' + fmtCurrency(aov.aov) + ' (' + (aov.orderCount || 0) + ' orders)' : '—';
        } catch (e) {
            console.error(e);
        }
    }

    async function loadActivityFeed() {
        try {
            const data = await api('/realtime/activity', { limit: 10 });
            const list = document.getElementById('activityFeed');
            if (!list) return;
            const items = Array.isArray(data) ? data : [];
            list.innerHTML = items.length ? items.map(a => '<li style="padding:6px 0;border-bottom:1px solid var(--admin-border,#e2e8f0);">' + (a.message || a.type) + ' <span style="color:var(--admin-muted,#718096);font-size:11px;">' + (a.created_at ? new Date(a.created_at).toLocaleString() : '') + '</span></li>').join('') : '<li>No recent activity</li>';
        } catch (e) {
            document.getElementById('activityFeed').innerHTML = '<li>Unable to load</li>';
        }
    }

    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        try { localStorage.setItem('admin_theme', theme); } catch (e) {}
        const btn = document.getElementById('themeToggle');
        if (btn) btn.textContent = theme === 'dark' ? '☀️ Light' : '🌓 Dark';
        if (chartMonthly) loadMonthlyChart();
        if (chartAnnual) loadAnnualChart();
        if (chartBreakdown) loadBreakdownChart();
        if (chartOrdersStatus) loadOrdersStatusChart();
    }

    async function refreshAll() {
        getRange();
        await loadKpis();
        await loadMonthlyChart();
        await loadAnnualChart();
        await loadBreakdownChart();
        await loadOrdersStatusChart();
        await loadTables();
        await loadActivityFeed();
    }

    function init() {
        const stored = localStorage.getItem('admin_theme');
        const theme = stored === 'dark' || stored === 'light' ? stored : 'light';
        applyTheme(theme);

        document.getElementById('themeToggle').addEventListener('click', function () {
            applyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
        });
        document.getElementById('applyRange').addEventListener('click', refreshAll);
        document.getElementById('exportCsv').addEventListener('click', function (e) {
            e.preventDefault();
            const range = getRange();
            window.open(base + '/sales/export?from=' + range.from + '&to=' + range.to + '&format=csv', '_blank');
        });

        checkAuth().then(function (ok) {
            if (ok) refreshAll();
        });

        setInterval(function () {
            if (document.getElementById('kpiVisitors')) loadKpis();
        }, 30000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
