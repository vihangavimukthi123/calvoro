// Donations (Stripe Checkout) — modal UI + API call
(function () {
    function $(id) { return document.getElementById(id); }
    var btn = $('donateDogsBtn');
    var modal = $('donateModal');
    var closeBtn = $('donateModalClose');
    var form = $('donationForm');
    var amountGrid = $('donateAmountGrid');
    var amountCustom = $('donateAmountCustom');
    var nameInput = $('donateName');
    var emailInput = $('donateEmail');
    var submitBtn = $('donateSubmit');
    var spinner = $('donateSpinner');
    var err = $('donateError');

    if (!btn || !modal || !closeBtn || !form) return;

    function setOpen(open) {
        modal.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (open) {
            setTimeout(function () { (amountCustom || nameInput || emailInput).focus(); }, 50);
        }
    }

    function setLoading(loading) {
        if (!submitBtn) return;
        submitBtn.disabled = !!loading;
        if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
    }

    function showError(message) {
        if (!err) return;
        err.textContent = message || '';
    }

    function setActiveAmount(amount) {
        if (!amountGrid) return;
        amountGrid.querySelectorAll('.donate-amount-btn').forEach(function (b) {
            b.classList.toggle('is-active', String(b.dataset.amount) === String(amount));
        });
    }

    function readAmount() {
        var v = (amountCustom && amountCustom.value) ? amountCustom.value : '';
        v = String(v).replace(/,/g, '').trim();
        var n = Number(v);
        if (!isFinite(n)) return null;
        var whole = Math.round(n);
        return whole;
    }

    btn.addEventListener('click', function () {
        showError('');
        setOpen(true);
    });

    closeBtn.addEventListener('click', function () { setOpen(false); });
    modal.addEventListener('click', function (e) { if (e.target === modal) setOpen(false); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') setOpen(false);
    });

    if (amountGrid) {
        amountGrid.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('.donate-amount-btn') : null;
            if (!b) return;
            var a = b.dataset.amount;
            if (amountCustom) amountCustom.value = a;
            setActiveAmount(a);
        });
    }

    if (amountCustom) {
        amountCustom.addEventListener('input', function () {
            setActiveAmount(String(readAmount() || ''));
        });
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        showError('');

        var amount = readAmount();
        var name = (nameInput && nameInput.value || '').trim();
        var email = (emailInput && emailInput.value || '').trim();
        var referenceInput = $('donateReference');
        var reference = (referenceInput && referenceInput.value || '').trim();

        if (!amount || amount < 100) return showError('Please enter an amount (min LKR 100).');
        if (!name) return showError('Please enter your name.');
        if (!email || email.indexOf('@') < 0) return showError('Please enter a valid email.');

        setLoading(true);
        try {
            // වෙනස් කළ කොටස: කෙලින්ම /api/donations/... යොදා ඇත
            var r = await fetch('/api/donations/checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: amount, name: name, email: email, reference_text: reference })
            });
            var d = await r.json().catch(function () { return {}; });
            if (!r.ok || !d || !d.url) {
                throw new Error((d && d.error) ? d.error : 'Could not start Stripe checkout.');
            }
            window.location.href = d.url;
        } catch (err2) {
            showError(err2 && err2.message ? err2.message : 'Something went wrong.');
            setLoading(false);
        }
    });
})();
