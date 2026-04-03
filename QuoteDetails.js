/**
 * QuoteDetails.js — IC Quote Analysis modal for CustomerRoadmap
 * Depends on: escHtml(), API_BASE_URL, codeBlock() from CustomerRoadmap.html / FlowLogs.js
 */

// ── Inject modal HTML ───────────────────────────────────────────────────────
(function injectQuoteDetailsModal() {
    var div = document.createElement('div');
    div.innerHTML =
        '<div class="qd-overlay" id="qdOverlay">' +
            '<div class="qd-modal">' +
                '<div class="qd-header">' +
                    '<div class="qd-header-left">' +
                        '<div class="qd-title" id="qdTitle">IC Quote Analysis</div>' +
                        '<div class="qd-ref"   id="qdRef"></div>' +
                    '</div>' +
                    '<button class="qd-close" id="qdClose">&times;</button>' +
                '</div>' +
                '<div class="qd-summary" id="qdSummary"></div>' +
                '<div class="qd-body"    id="qdBody">' +
                    '<div class="qd-loader"><div class="qd-spinner"></div><div class="qd-loader-text">Loading\u2026</div></div>' +
                '</div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(div.firstChild);

    document.getElementById('qdOverlay').addEventListener('click', function(e) {
        if (e.target === this) closeQuoteDetailsModal();
    });
    document.getElementById('qdClose').addEventListener('click', closeQuoteDetailsModal);
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeQuoteDetailsModal();
    });
})();

// ── State ───────────────────────────────────────────────────────────────────
var _qdAllIcDetails = [];
var _qdActiveFilter = 'all';

// ── Open / close ────────────────────────────────────────────────────────────
async function openQuoteDetailsModal(refNum) {
    var overlay = document.getElementById('qdOverlay');
    var body    = document.getElementById('qdBody');
    var summary = document.getElementById('qdSummary');

    document.getElementById('qdTitle').textContent = 'IC Quote Analysis';
    document.getElementById('qdRef').textContent   = 'Reference: ' + refNum;
    summary.innerHTML = '';
    body.innerHTML =
        '<div class="qd-loader">' +
            '<div class="qd-spinner"></div>' +
            '<div class="qd-loader-text">Fetching quote details\u2026</div>' +
        '</div>';
    overlay.classList.add('open');
    _qdActiveFilter = 'all';

    try {
        var url  = API_BASE_URL + '/admin/customer-roadmap/quote-details?referenceNumber=' + encodeURIComponent(refNum);
        var resp = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + (sessionStorage.getItem('adminToken') || ''), 'accept': 'application/json' }
        });
        var data = await resp.json();

        var ok  = data.isSuccess !== undefined ? data.isSuccess : data.IsSuccess;
        var det = data.details   !== undefined ? data.details   : data.Details;

        if (!ok || !det) {
            body.innerHTML = '<div class="qd-empty">Failed to load quote details.</div>';
            return;
        }

        _qdAllIcDetails = det.icDetails || det.IcDetails || [];
        _qdActiveFilter = 'all';

        summary.innerHTML = buildSummaryBar(det);
        renderFilteredCards();
    } catch (err) {
        body.innerHTML = '<div class="qd-empty">Error: ' + escHtml(err.message) + '</div>';
    }
}

function closeQuoteDetailsModal() {
    var ov = document.getElementById('qdOverlay');
    if (ov) ov.classList.remove('open');
}

// ── Summary / filter bar ────────────────────────────────────────────────────
function buildSummaryBar(det) {
    var total   = det.totalICsRequested || det.TotalICsRequested || 0;
    var success = det.totalSuccessful   || det.TotalSuccessful   || 0;
    var failed  = det.totalFailed       || det.TotalFailed       || 0;
    var skipped = det.totalSkipped      || det.TotalSkipped      || 0;

    return (
        '<button class="qd-stat stat-all active" onclick="qdSetFilter(\'all\', this)">' +
            '<span class="qd-stat-num">' + total + '</span>&nbsp;Total ICs' +
        '</button>' +
        '<div class="qd-divider"></div>' +
        '<button class="qd-stat stat-success" onclick="qdSetFilter(\'success\', this)">' +
            '<span class="qd-stat-num">' + success + '</span>&nbsp;Success' +
        '</button>' +
        '<button class="qd-stat stat-failed" onclick="qdSetFilter(\'failed\', this)">' +
            '<span class="qd-stat-num">' + failed + '</span>&nbsp;Failed' +
        '</button>' +
        '<button class="qd-stat stat-skipped" onclick="qdSetFilter(\'skipped\', this)">' +
            '<span class="qd-stat-num">' + skipped + '</span>&nbsp;Skipped' +
        '</button>'
    );
}

function qdSetFilter(filter, btn) {
    _qdActiveFilter = filter;
    document.querySelectorAll('#qdSummary .qd-stat').forEach(function(b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');
    renderFilteredCards();
}

function renderFilteredCards() {
    var body = document.getElementById('qdBody');
    var filtered = _qdActiveFilter === 'all'
        ? _qdAllIcDetails
        : _qdAllIcDetails.filter(function(ic) {
            return (ic.status || ic.Status || '').toLowerCase() === _qdActiveFilter;
          });

    if (filtered.length === 0) {
        body.innerHTML = '<div class="qd-empty">No ICs found for this filter.</div>';
        return;
    }

    // Sort: Success → Failed → Skipped
    var order = { success: 0, failed: 1, skipped: 2 };
    var sorted = filtered.slice().sort(function(a, b) {
        var sa = (a.status || a.Status || '').toLowerCase();
        var sb = (b.status || b.Status || '').toLowerCase();
        return (order[sa] !== undefined ? order[sa] : 9) - (order[sb] !== undefined ? order[sb] : 9);
    });

    body.innerHTML = sorted.map(function(ic, idx) {
        return buildIcCard(ic, idx);
    }).join('');
}

// ── IC card ─────────────────────────────────────────────────────────────────
function buildIcCard(ic, idx) {
    var name     = ic.insuranceCompanyName || ic.InsuranceCompanyName || 'Unknown IC';
    var isOffline= !!(ic.isOffline         || ic.IsOffline);
    var status   = (ic.status             || ic.Status               || '').toLowerCase();
    var reasons  = ic.skipReasons         || ic.SkipReasons          || [];
    var failures = ic.failureReasons      || ic.FailureReasons       || [];
    var qd       = ic.quoteDetails        || ic.QuoteDetails         || null;
    var apiReq   = ic.apiRequestRaw       || ic.ApiRequestRaw        || null;
    var apiRes   = ic.apiResponseRaw      || ic.ApiResponseRaw       || null;

    var statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    var statusClass = status === 'success' ? 's-success' : status === 'failed' ? 's-failed' : 's-skipped';
    var cardId = 'qd_ic_' + idx;

    // Success cards are expanded by default so quote details are immediately visible
    var defaultOpen = (status === 'success');

    // Collapsed preview line
    var preview = '';
    if (status === 'success' && qd) {
        var prevPrem = qd.premium || qd.Premium;
        preview = 'AED ' + (prevPrem ? Number(prevPrem).toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'N/A') +
                  ' \u00b7 ' + (qd.insuranceType || qd.InsuranceType || '') +
                  ((qd.isInvalid || qd.IsInvalid) ? ' \u00b7 Invalid' : ' \u00b7 Valid');
    } else if (status === 'failed' && failures.length > 0) {
        preview = failures[0];
    } else if (status === 'skipped' && reasons.length > 0) {
        preview = reasons[0];
    }

    // ── Card body content ───────────────────────────────────────────────────
    var bodyHtml = '';

    // Success — quote summary grid
    if (status === 'success' && qd) {
        var prem    = qd.premium       || qd.Premium;
        var type    = qd.insuranceType || qd.InsuranceType || 'N/A';
        var expiry  = qd.expiryDate    || qd.ExpiryDate;
        var invalid = !!(qd.isInvalid  || qd.IsInvalid);

        bodyHtml +=
            '<div class="qd-section-label">Quote Summary</div>' +
            '<div class="qd-quote-grid">' +
                '<div class="qd-quote-cell">' +
                    '<span>Premium</span>' +
                    '<strong>AED ' + (prem ? Number(prem).toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'N/A') + '</strong>' +
                '</div>' +
                '<div class="qd-quote-cell">' +
                    '<span>Coverage Type</span>' +
                    '<strong>' + escHtml(type) + '</strong>' +
                '</div>' +
                (expiry
                    ? '<div class="qd-quote-cell"><span>Expiry</span><strong>' + new Date(expiry).toLocaleDateString() + '</strong></div>'
                    : '') +
                '<div class="qd-quote-cell">' +
                    '<span>Valid</span>' +
                    '<strong>' + (invalid
                        ? '<span style="color:#ef4444;font-weight:700;">&#10007; Invalid</span>'
                        : '<span style="color:#16a34a;font-weight:700;">&#10003; Valid</span>') + '</strong>' +
                '</div>' +
                '<div class="qd-quote-cell">' +
                    '<span>Channel</span>' +
                    '<strong>' + (isOffline ? 'Offline' : 'Online') + '</strong>' +
                '</div>' +
            '</div>';
    }

    // Failed — failure reasons
    if (failures.length > 0) {
        bodyHtml +=
            '<div class="qd-section-label">Failure Reasons</div>' +
            '<ul class="qd-reasons">' +
            failures.map(function(r) { return '<li>' + escHtml(r) + '</li>'; }).join('') +
            '</ul>';
    }

    // Skipped — skip reasons
    if (reasons.length > 0) {
        bodyHtml +=
            '<div class="qd-section-label">Skip Reasons</div>' +
            '<ul class="qd-reasons">' +
            reasons.map(function(r) { return '<li>' + escHtml(r) + '</li>'; }).join('') +
            '</ul>';
    }

    // IC API payload (expandable)
    if (apiReq || apiRes) {
        var toggleId = cardId + '_api';
        bodyHtml +=
            '<div class="qd-section-label">IC API Payload</div>' +
            '<button class="qd-api-toggle" onclick="qdToggleApi(\'' + toggleId + '\', this)">' +
                '&#9654; Show API Request / Response' +
            '</button>' +
            '<div class="qd-api-block" id="' + toggleId + '">' +
                (apiReq ? '<div class="qd-section-label">Request</div>'  + codeBlock(apiReq, toggleId + '_req') : '') +
                (apiRes ? '<div class="qd-section-label">Response</div>' + codeBlock(apiRes, toggleId + '_res') : '') +
            '</div>';
    }

    if (!bodyHtml) {
        bodyHtml = '<div style="font-size:0.82em;color:#94a3b8;padding:4px 0;">No additional details available.</div>';
    }

    return (
        '<div class="qd-ic-card status-' + status + (defaultOpen ? ' open' : '') + '" id="' + cardId + '">' +
            '<div class="qd-ic-header" onclick="qdToggleCard(\'' + cardId + '\')">' +
                '<div class="qd-ic-name">' + escHtml(name) + '</div>' +
                '<span class="qd-ic-mode' + (isOffline ? ' offline' : '') + '">' +
                    (isOffline ? 'Offline' : 'Online') +
                '</span>' +
                '<span class="qd-ic-status ' + statusClass + '">' + statusLabel + '</span>' +
                '<span class="qd-ic-chevron">&#9654;</span>' +
            '</div>' +
            (!defaultOpen && preview ? '<div class="qd-ic-preview">' + escHtml(preview) + '</div>' : '') +
            '<div class="qd-ic-body">' + bodyHtml + '</div>' +
        '</div>'
    );
}

// ── Toggle helpers ──────────────────────────────────────────────────────────
function qdToggleCard(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
}

function qdToggleApi(blockId, btn) {
    var block = document.getElementById(blockId);
    if (!block) return;
    block.classList.toggle('open');
    btn.innerHTML = block.classList.contains('open')
        ? '&#9660; Hide API Request / Response'
        : '&#9654; Show API Request / Response';
}
