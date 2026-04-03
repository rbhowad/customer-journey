/**
 * BusinessInsights.js — Business Insights tab for CustomerRoadmap
 * Depends on: API_BASE_URL, authHeaders(), Chart.js (already loaded), escHtml()
 */

var _biCharts = {};

// ── Entry point (called from CustomerRoadmap tab switch) ─────────────────────
function renderBusinessInsights() {
    var container = document.getElementById('bi-content');
    if (!container) return;

    _biDestroyCharts();

    var today = new Date();
    var from  = new Date(today); from.setDate(from.getDate() - 29);
    var defFrom = _biDateStr(from);
    var defTo   = _biDateStr(today);

    container.innerHTML =
        '<div class="bi-filter-bar">' +
            '<div class="bi-filter-group">' +
                '<label class="bi-filter-label">From</label>' +
                '<input class="bi-filter-input" type="date" id="biDateFrom" value="' + defFrom + '">' +
            '</div>' +
            '<div class="bi-filter-group">' +
                '<label class="bi-filter-label">To</label>' +
                '<input class="bi-filter-input" type="date" id="biDateTo" value="' + defTo + '">' +
            '</div>' +
            '<button class="bi-filter-btn" id="biLoadBtn" onclick="_biLoad()">&#9654; Load</button>' +
        '</div>' +
        '<div id="bi-results"></div>';

    _biLoad();
}

function _biDateStr(d) {
    return d.toISOString().slice(0, 10);
}

function _biDestroyCharts() {
    Object.keys(_biCharts).forEach(function(k) { try { _biCharts[k].destroy(); } catch (_) {} });
    _biCharts = {};
}

async function _biLoad() {
    var fromVal = (document.getElementById('biDateFrom') || {}).value || '';
    var toVal   = (document.getElementById('biDateTo')   || {}).value || '';
    var btn     = document.getElementById('biLoadBtn');
    var results = document.getElementById('bi-results');

    if (!results) return;
    _biDestroyCharts();
    results.innerHTML = '<div class="bi-empty"><div class="bi-empty-icon">&#8987;</div><div class="bi-empty-title">Loading\u2026</div></div>';
    if (btn) { btn.disabled = true; btn.textContent = 'Loading\u2026'; }

    try {
        var qs = [];
        if (fromVal) qs.push('dateFrom=' + encodeURIComponent(fromVal));
        if (toVal)   qs.push('dateTo='   + encodeURIComponent(toVal));
        var url = API_BASE_URL + '/admin/customer-roadmap/business-insights' + (qs.length ? '?' + qs.join('&') : '');

        var resp = await fetch(url, { headers: authHeaders({ accept: 'application/json' }) });
        var data = await resp.json();
        var ok   = data.isSuccess !== undefined ? data.isSuccess : data.IsSuccess;
        var det  = data.details   !== undefined ? data.details   : data.Details;

        if (!ok || !det) {
            results.innerHTML = '<div class="bi-empty"><div class="bi-empty-icon">&#128683;</div><div class="bi-empty-title">Failed to load data</div></div>';
            return;
        }

        var m = _biAdaptResponse(det);
        results.innerHTML =
            buildKpiSection(m) +
            buildFunnelSection(m) +
            buildICSection(m) +
            buildMixSection(m) +
            buildPremiumSection(m) +
            buildImpactSection(m) +
            buildRankingSection(m) +
            buildTrendSection(m);

        setTimeout(function() {
            drawICChart(m);
            drawCoverageChart(m);
            drawPlatformChart(m);
            drawRepairChart(m);
            drawPremiumHistogram(m);
            drawTrendChart(m);
        }, 0);

    } catch (err) {
        results.innerHTML = '<div class="bi-empty"><div class="bi-empty-icon">&#9888;</div><div class="bi-empty-title">Error</div><div class="bi-empty-sub">' + escHtml(err.message) + '</div></div>';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '&#9654; Load'; }
    }
}

// ── API response adapter — converts API response to metrics object ────────────
function _biAdaptResponse(data) {
    var s = data.summary || data.Summary || {};
    var m = {
        totalJourneys:          s.totalJourneys          || 0,
        journeysWithRequest:    s.journeysWithRequest    || 0,
        journeysWithQuotes:     s.journeysWithQuotes     || 0,
        journeysWithValidOffers:s.journeysWithValidOffers|| 0,
        journeysConverted:      s.journeysConverted      || 0,
        totalQuoteRequests:     s.totalQuoteRequests     || 0,
        totalQuotesGenerated:   s.totalQuotesGenerated   || 0,
        totalValidOffers:       s.totalValidOffers       || 0,
        totalPolicies:          s.totalPolicies          || 0,
        errorJourneys:          s.errorJourneys          || 0,
        avgPremium:             Math.round(s.avgPremium  || 0),
        minPremium:             Math.round(s.minPremium  || 0),
        maxPremium:             Math.round(s.maxPremium  || 0),
        totalPaymentAmount:     s.totalRevenue           || 0,
        partnerCounts: {},
        paymentMethods: {}
    };

    // Derived rates
    m.conversionRate  = m.totalJourneys           > 0 ? +(m.journeysConverted       / m.totalJourneys           * 100).toFixed(1) : 0;
    m.quoteGenRate    = m.journeysWithRequest      > 0 ? +(m.journeysWithQuotes      / m.journeysWithRequest      * 100).toFixed(1) : 0;
    m.offerToConvRate = m.journeysWithValidOffers  > 0 ? +(m.journeysConverted       / m.journeysWithValidOffers  * 100).toFixed(1) : 0;
    m.blockedJourneys = m.journeysWithRequest  - m.journeysWithQuotes;
    m.droppedJourneys = m.journeysWithValidOffers - m.journeysConverted;

    // IC ranking
    var ics = data.icPerformance || data.IcPerformance || [];
    m.icRanking = ics.map(function(ic) {
        var name  = ic.insuranceCompanyName || ic.InsuranceCompanyName || 'Unknown';
        var total = ic.totalQuotes          || ic.TotalQuotes          || 0;
        var valid = ic.validQuotes          || ic.ValidQuotes          || 0;
        return { name: name, total: total, valid: valid, validRate: total ? +(valid / total * 100).toFixed(0) : 0 };
    });
    m.topIcMax = m.icRanking.length ? m.icRanking[0].valid : 1;

    // Distribution count maps
    function toMap(arr) {
        var map = {};
        (arr || []).forEach(function(item) {
            var name  = item.name  || item.Name  || 'Unknown';
            var count = item.count || item.Count || 0;
            map[name] = count;
        });
        return map;
    }
    m.coverageCounts  = toMap(data.coverageTypes  || data.CoverageTypes);
    m.platformCounts  = toMap(data.platforms       || data.Platforms);
    m.repairCounts    = toMap(data.repairMethods   || data.RepairMethods);
    m.renewTypeCounts = toMap(data.renewalTypes    || data.RenewalTypes);

    // Premium buckets
    var bucketData = data.premiumBuckets || data.PremiumBuckets || [];
    m.premBuckets = {
        labels: bucketData.map(function(b) { return b.bucketLabel || b.BucketLabel || ''; }),
        data:   bucketData.map(function(b) { return b.count       || b.Count       || 0;  })
    };
    m.totalPremiumOffers = m.premBuckets.data.reduce(function(a, b) { return a + b; }, 0);

    // Daily trend
    m.dailyTrend = (data.dailyTrend || data.DailyTrend || []).map(function(d) {
        return {
            date:            d.date            || d.Date            || '',
            journeyCount:    d.journeyCount    || d.JourneyCount    || 0,
            conversionCount: d.conversionCount || d.ConversionCount || 0
        };
    });

    return m;
}

// ── Legacy client-side helpers (kept for reference, no longer called) ─────────
function _legacyComputeMetrics_unused(journeys) {
    var m = {
        totalJourneys: journeys.length, journeysWithRequest: 0, journeysWithQuotes: 0,
        journeysWithValidOffers: 0, journeysConverted: 0, totalQuoteRequests: 0,
        totalQuotesGenerated: 0, totalValidOffers: 0, totalPolicies: 0,
        icQuoteCounts: {}, icValidCounts: {}, coverageCounts: {}, platformCounts: {},
        partnerCounts: {}, renewTypeCounts: {}, repairCounts: {}, premiums: [],
        errorJourneys: 0, totalPaymentAmount: 0, paymentMethods: {}
    };

    journeys.forEach(function(j) {
        var qrs = j.quoteRequests || j.QuoteRequests || [];
        var platform  = j.platformName  || j.PlatformName  || 'Unknown';
        var partner   = j.partnerName   || j.PartnerName   || '';
        var renewType = j.renewTypeName || j.RenewTypeName || 'Unknown';
        var errorCode = j.errorCode     || j.ErrorCode     || '';

        if (errorCode) m.errorJourneys++;

        m.platformCounts[platform] = (m.platformCounts[platform] || 0) + 1;
        if (partner) m.partnerCounts[partner] = (m.partnerCounts[partner] || 0) + 1;
        m.renewTypeCounts[renewType] = (m.renewTypeCounts[renewType] || 0) + 1;

        var hasRequest  = qrs.length > 0;
        var hasQuote    = false;
        var hasValid    = false;
        var hasConvert  = false;

        qrs.forEach(function(qr) {
            m.totalQuoteRequests++;
            var totalQ = qr.totalQuotesGenerated || qr.TotalQuotesGenerated || 0;
            var totalV = qr.totalValidOffers     || qr.TotalValidOffers     || 0;
            var purchased = qr.isPurchased       || qr.IsPurchased          || false;

            m.totalQuotesGenerated += totalQ;
            m.totalValidOffers     += totalV;

            if (totalQ > 0) hasQuote  = true;
            if (totalV > 0) hasValid  = true;
            if (purchased)  hasConvert = true;

            // Quote offers
            var offers = qr.quoteOffers || qr.QuoteOffers || [];
            offers.forEach(function(o) {
                var ic       = o.insuranceCompanyName || o.InsuranceCompanyName || 'Unknown';
                var coverage = o.insuranceTypeName    || o.InsuranceTypeName    || 'Unknown';
                var repair   = o.repairMethodName     || o.RepairMethodName     || 'Unknown';
                var premium  = parseFloat(o.premium   || o.Premium              || 0);
                var invalid  = o.isInvalid            || o.IsInvalid            || false;

                m.icQuoteCounts[ic] = (m.icQuoteCounts[ic] || 0) + 1;
                if (!invalid) {
                    m.icValidCounts[ic] = (m.icValidCounts[ic] || 0) + 1;
                    if (premium > 0) m.premiums.push(premium);
                }
                m.coverageCounts[coverage] = (m.coverageCounts[coverage] || 0) + 1;
                m.repairCounts[repair]     = (m.repairCounts[repair]     || 0) + 1;
            });

            // Policies — legacy only
            m.totalPolicies += (qr.policies || qr.Policies || []).length;
        });

        if (hasRequest) m.journeysWithRequest++;
        if (hasQuote)   m.journeysWithQuotes++;
        if (hasValid)   m.journeysWithValidOffers++;
        if (hasConvert) m.journeysConverted++;
    });

    return m; // Legacy: caller computes derived fields if needed
}

function computePremiumBuckets_unused(premiums) {
    if (!premiums.length) return { labels: [], data: [] };
    var buckets = [
        { label: '< 500',    min: 0,     max: 500   },
        { label: '500–1K',   min: 500,   max: 1000  },
        { label: '1K–2K',    min: 1000,  max: 2000  },
        { label: '2K–3K',    min: 2000,  max: 3000  },
        { label: '3K–5K',    min: 3000,  max: 5000  },
        { label: '5K–10K',   min: 5000,  max: 10000 },
        { label: '> 10K',    min: 10000, max: Infinity }
    ];
    buckets.forEach(function(b) { b.count = 0; });
    premiums.forEach(function(p) {
        var b = buckets.find(function(b) { return p >= b.min && p < b.max; });
        if (b) b.count++;
    });
    return { labels: buckets.map(function(b) { return b.label; }), data: buckets.map(function(b) { return b.count; }) };
}

// ── Section builders ─────────────────────────────────────────────────────────
function biSection(icon, title, sub, body) {
    return '<div class="bi-section">' +
        '<div class="bi-section-header">' +
            '<span class="bi-section-icon">' + icon + '</span>' +
            '<span class="bi-section-title">' + title + '</span>' +
            (sub ? '<span class="bi-section-sub">' + sub + '</span>' : '') +
        '</div>' +
        '<div class="bi-section-body">' + body + '</div>' +
    '</div>';
}

function biKpi(label, value, sub, color, badge, badgeType) {
    return '<div class="bi-kpi-card ' + (color || 'blue') + '">' +
        '<div class="bi-kpi-label">' + label + '</div>' +
        '<div class="bi-kpi-value">' + value + '</div>' +
        (sub ? '<div class="bi-kpi-sub">' + sub + '</div>' : '') +
        (badge ? '<div class="bi-kpi-badge ' + (badgeType || 'neutral') + '">' + badge + '</div>' : '') +
    '</div>';
}

function fmtNum(n) { return Number(n).toLocaleString('en-US'); }
function fmtAed(n) { return 'AED ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 }); }

// ── 1. KPI Cards ─────────────────────────────────────────────────────────────
function buildKpiSection(m) {
    var convBadge = m.conversionRate >= 30 ? m.conversionRate + '% ↑' : m.conversionRate + '% ↓';
    var convType  = m.conversionRate >= 30 ? 'up' : 'down';

    var cards =
        biKpi('Journeys Analysed', fmtNum(m.totalJourneys), m.totalQuoteRequests + ' quote requests', 'blue') +
        biKpi('Conversion Rate', m.conversionRate + '%', 'Journeys ending in a policy', m.conversionRate >= 30 ? 'green' : 'red', convBadge, convType) +
        biKpi('Policies Issued', fmtNum(m.totalPolicies), 'Successful purchases', 'green') +
        biKpi('Avg Valid Offers', m.totalQuoteRequests > 0 ? (m.totalValidOffers / m.totalQuoteRequests).toFixed(1) : '0', 'Per quote request', 'teal') +
        biKpi('Avg Premium', fmtAed(m.avgPremium), 'Across valid offers', 'purple');

    return biSection('&#128200;', 'Performance Summary', m.totalJourneys + ' journeys', '<div class="bi-kpi-grid">' + cards + '</div>');
}

// ── 2. Conversion Funnel ─────────────────────────────────────────────────────
function buildFunnelSection(m) {
    var stages = [
        { label: 'Journey Started',     count: m.totalJourneys,              color: 'f-blue',   pct: '100%' },
        { label: 'Quote Requested',     count: m.journeysWithRequest,         color: 'f-indigo', pct: m.totalJourneys ? (m.journeysWithRequest / m.totalJourneys * 100).toFixed(0) + '%' : '-' },
        { label: 'Offers Received',     count: m.journeysWithValidOffers,     color: 'f-violet', pct: m.journeysWithRequest ? (m.journeysWithValidOffers / m.journeysWithRequest * 100).toFixed(0) + '%' : '-' },
        { label: 'Policy Purchased',    count: m.journeysConverted,           color: 'f-green',  pct: m.journeysWithValidOffers ? (m.journeysConverted / m.journeysWithValidOffers * 100).toFixed(0) + '%' : '-' }
    ];

    var html = '<div class="bi-funnel">';
    stages.forEach(function(s, i) {
        html += '<div class="bi-funnel-stage">' +
            '<div class="bi-funnel-bar-wrap">' +
                '<div class="bi-funnel-bar ' + s.color + '">' + fmtNum(s.count) + '</div>' +
            '</div>' +
            '<div class="bi-funnel-label">' + s.label + '</div>' +
            '<div class="bi-funnel-pct">' + s.pct + ' of total</div>' +
        '</div>';
        if (i < stages.length - 1) {
            html += '<div style="display:flex;align-items:center;padding-bottom:32px;color:#cbd5e1;font-size:1.3em;">&#8250;</div>';
        }
    });
    html += '</div>';

    return biSection('&#128260;', 'Conversion Funnel', 'Customer journey drop-off at each stage', html);
}

// ── 3. IC Performance ────────────────────────────────────────────────────────
function buildICSection(m) {
    return biSection('&#127970;', 'Insurance Company Performance', 'Quotes generated per IC (valid only)',
        '<div class="bi-chart-card"><div class="bi-chart-title">Valid Quotes by Insurance Company</div>' +
        '<div class="bi-chart-wrap tall"><canvas id="biIcChart"></canvas></div></div>'
    );
}

// ── 4. Mix Charts ────────────────────────────────────────────────────────────
function buildMixSection(m) {
    var html = '<div class="bi-charts-grid cols-3">' +
        '<div class="bi-chart-card"><div class="bi-chart-title">Coverage Type</div><div class="bi-chart-wrap"><canvas id="biCoverageChart"></canvas></div></div>' +
        '<div class="bi-chart-card"><div class="bi-chart-title">Customer Platform</div><div class="bi-chart-wrap"><canvas id="biPlatformChart"></canvas></div></div>' +
        '<div class="bi-chart-card"><div class="bi-chart-title">Repair Method</div><div class="bi-chart-wrap"><canvas id="biRepairChart"></canvas></div></div>' +
    '</div>';

    // Renewal type and partner pills
    var renewPills = Object.keys(m.renewTypeCounts).sort(function(a,b){ return m.renewTypeCounts[b] - m.renewTypeCounts[a]; }).map(function(k) {
        return '<div class="bi-pill"><span class="bi-pill-count">' + fmtNum(m.renewTypeCounts[k]) + '</span><span class="bi-pill-name">' + escHtml(k) + '</span></div>';
    }).join('');

    var partnerKeys = Object.keys(m.partnerCounts).sort(function(a,b){ return m.partnerCounts[b] - m.partnerCounts[a]; }).slice(0, 8);
    var partnerPills = partnerKeys.map(function(k) {
        return '<div class="bi-pill"><span class="bi-pill-count">' + fmtNum(m.partnerCounts[k]) + '</span><span class="bi-pill-name">' + escHtml(k) + '</span></div>';
    }).join('');

    if (renewPills) {
        html += '<div style="margin-top:14px;"><div class="bi-chart-title" style="margin-bottom:8px;">Renewal Type</div><div class="bi-pill-list">' + renewPills + '</div></div>';
    }
    if (partnerPills) {
        html += '<div style="margin-top:14px;"><div class="bi-chart-title" style="margin-bottom:8px;">Top Partners</div><div class="bi-pill-list">' + partnerPills + '</div></div>';
    }

    return biSection('&#127774;', 'Channel & Product Mix', 'Distribution of key business dimensions', html);
}

// ── 5. Premium Analysis ──────────────────────────────────────────────────────
function buildPremiumSection(m) {
    var statsHtml = '<div class="bi-prem-stats">' +
        '<div class="bi-prem-stat"><div class="bi-prem-stat-label">Min Premium</div><div class="bi-prem-stat-val"><span>AED</span> ' + fmtNum(m.minPremium) + '</div></div>' +
        '<div class="bi-prem-stat"><div class="bi-prem-stat-label">Avg Premium</div><div class="bi-prem-stat-val"><span>AED</span> ' + fmtNum(m.avgPremium) + '</div></div>' +
        '<div class="bi-prem-stat"><div class="bi-prem-stat-label">Max Premium</div><div class="bi-prem-stat-val"><span>AED</span> ' + fmtNum(m.maxPremium) + '</div></div>' +
    '</div>';

    var histHtml = '<div class="bi-chart-card"><div class="bi-chart-title">Premium Distribution (AED)</div>' +
        '<div class="bi-chart-wrap"><canvas id="biPremChart"></canvas></div></div>';

    return biSection('&#128176;', 'Premium Analysis', (m.totalPremiumOffers || m.totalValidOffers || 0) + ' valid offers',
        statsHtml + histHtml);
}

// ── 6. Customer Impact ───────────────────────────────────────────────────────
function buildImpactSection(m) {
    var html = '<div class="bi-impact-grid">' +
        '<div class="bi-impact-card ' + (m.blockedJourneys > 0 ? 'critical' : 'success') + '">' +
            '<div class="bi-impact-val">' + fmtNum(m.blockedJourneys) + '</div>' +
            '<div class="bi-impact-label">Blocked Journeys</div>' +
            '<div class="bi-impact-desc">Requested a quote but received nothing</div>' +
        '</div>' +
        '<div class="bi-impact-card ' + (m.droppedJourneys > 10 ? 'warning' : 'info') + '">' +
            '<div class="bi-impact-val">' + fmtNum(m.droppedJourneys) + '</div>' +
            '<div class="bi-impact-label">Got Offers, Didn\'t Purchase</div>' +
            '<div class="bi-impact-desc">Received valid offers but did not buy a policy</div>' +
        '</div>' +
        '<div class="bi-impact-card ' + (m.errorJourneys > 0 ? 'warning' : 'success') + '">' +
            '<div class="bi-impact-val">' + fmtNum(m.errorJourneys) + '</div>' +
            '<div class="bi-impact-label">Journeys with Errors</div>' +
            '<div class="bi-impact-desc">Encountered a system error during the journey</div>' +
        '</div>' +
        '<div class="bi-impact-card success">' +
            '<div class="bi-impact-val">' + m.offerToConvRate + '%</div>' +
            '<div class="bi-impact-label">Offer-to-Purchase Rate</div>' +
            '<div class="bi-impact-desc">Of journeys with valid offers that resulted in a purchase</div>' +
        '</div>' +
    '</div>';

    return biSection('&#128204;', 'Customer Impact', 'Where customers are getting stuck', html);
}

// ── 7. IC Ranking Table ──────────────────────────────────────────────────────
function buildRankingSection(m) {
    if (!m.icRanking.length) return '';

    var maxTotal = m.icRanking.length ? m.icRanking[0].total : 1;
    var rows = m.icRanking.slice(0, 15).map(function(ic, i) {
        var rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
        var rankMedal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : (i + 1);
        var barWidthTotal = Math.round(ic.total / maxTotal * 100);
        var barWidthValid = ic.total ? Math.round(ic.valid / ic.total * 100) : 0;
        return '<tr>' +
            '<td class="rank ' + rankClass + '">' + rankMedal + '</td>' +
            '<td><strong>' + escHtml(ic.name) + '</strong></td>' +
            '<td>' +
                '<div class="bi-bar-cell">' +
                    '<div class="bi-bar-bg"><div class="bi-bar-fill" style="width:' + barWidthTotal + '%"></div></div>' +
                    fmtNum(ic.total) +
                '</div>' +
            '</td>' +
            '<td>' +
                '<div class="bi-bar-cell">' +
                    '<div class="bi-bar-bg"><div class="bi-bar-fill green" style="width:' + barWidthValid + '%"></div></div>' +
                    fmtNum(ic.valid) +
                '</div>' +
            '</td>' +
            '<td>' +
                (ic.validRate >= 70
                    ? '<span class="bi-valid-badge">' + ic.validRate + '%</span>'
                    : '<span class="bi-invalid-badge">' + ic.validRate + '%</span>') +
            '</td>' +
        '</tr>';
    }).join('');

    var table = '<div style="overflow-x:auto;"><table class="bi-table">' +
        '<thead><tr>' +
            '<th>#</th><th>Insurance Company</th><th>Total Quotes</th><th>Valid Quotes</th><th>Valid Rate</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
    '</table></div>';

    return biSection('&#127942;', 'IC Leaderboard', 'Ranked by valid quote contribution', table);
}

// ── Chart drawing ─────────────────────────────────────────────────────────────
var _biColors = [
    '#2563eb','#7c3aed','#0891b2','#16a34a','#d97706','#dc2626',
    '#db2777','#059669','#ea580c','#8b5cf6','#06b6d4','#84cc16'
];

function drawICChart(m) {
    var canvas = document.getElementById('biIcChart');
    if (!canvas) return;
    var top = m.icRanking.slice(0, 12);
    _biCharts.ic = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: top.map(function(ic) { return ic.name; }),
            datasets: [
                {
                    label: 'Valid Offers',
                    data: top.map(function(ic) { return ic.valid; }),
                    backgroundColor: '#16a34a',
                    borderRadius: 4
                },
                {
                    label: 'Total Offers',
                    data: top.map(function(ic) { return ic.total - ic.valid; }),
                    backgroundColor: '#e2e8f0',
                    borderRadius: 4
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
            scales: {
                x: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
                y: { stacked: true, ticks: { font: { size: 11 } }, grid: { display: false } }
            }
        }
    });
}

function drawCoverageChart(m) {
    var canvas = document.getElementById('biCoverageChart');
    if (!canvas) return;
    var keys = Object.keys(m.coverageCounts);
    _biCharts.coverage = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: keys,
            datasets: [{ data: keys.map(function(k) { return m.coverageCounts[k]; }), backgroundColor: _biColors, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } }
        }
    });
}

function drawPlatformChart(m) {
    var canvas = document.getElementById('biPlatformChart');
    if (!canvas) return;
    var keys = Object.keys(m.platformCounts);
    _biCharts.platform = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: keys,
            datasets: [{ data: keys.map(function(k) { return m.platformCounts[k]; }), backgroundColor: _biColors.slice(2), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } }
        }
    });
}

function drawRepairChart(m) {
    var canvas = document.getElementById('biRepairChart');
    if (!canvas) return;
    var keys = Object.keys(m.repairCounts).filter(function(k) { return k !== 'Unknown'; });
    if (!keys.length) keys = Object.keys(m.repairCounts);
    _biCharts.repair = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: keys,
            datasets: [{ data: keys.map(function(k) { return m.repairCounts[k]; }), backgroundColor: ['#2563eb','#16a34a','#d97706','#7c3aed'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } }
        }
    });
}

function drawPremiumHistogram(m) {
    var canvas = document.getElementById('biPremChart');
    if (!canvas || !m.premBuckets.labels.length) return;
    _biCharts.prem = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: m.premBuckets.labels,
            datasets: [{ label: 'Offers', data: m.premBuckets.data, backgroundColor: '#818cf8', borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { size: 11 } }, grid: { display: false } }
            }
        }
    });
}

// ── 8. Daily Trend section & chart ───────────────────────────────────────────
function buildTrendSection(m) {
    if (!m.dailyTrend || !m.dailyTrend.length) return '';
    return biSection('&#128197;', 'Daily Trend', m.dailyTrend.length + ' days',
        '<div class="bi-chart-card"><div class="bi-chart-title">Journeys &amp; Conversions per Day</div>' +
        '<div class="bi-chart-wrap tall"><canvas id="biTrendChart"></canvas></div></div>'
    );
}

function drawTrendChart(m) {
    var canvas = document.getElementById('biTrendChart');
    if (!canvas || !m.dailyTrend || !m.dailyTrend.length) return;
    _biCharts.trend = new Chart(canvas, {
        type: 'line',
        data: {
            labels: m.dailyTrend.map(function(d) { return d.date ? d.date.toString().slice(0, 10) : ''; }),
            datasets: [
                {
                    label: 'Journeys',
                    data: m.dailyTrend.map(function(d) { return d.journeyCount; }),
                    borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)',
                    fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2
                },
                {
                    label: 'Conversions',
                    data: m.dailyTrend.map(function(d) { return d.conversionCount; }),
                    borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.08)',
                    fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { size: 10 }, maxRotation: 45 }, grid: { display: false } }
            }
        }
    });
}
