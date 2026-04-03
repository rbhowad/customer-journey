/**
 * FlowLogs.js — API log modal for CustomerRoadmap
 * Depends on: escHtml() and API_BASE_URL defined in CustomerRoadmap.html
 */

// ── Modal HTML ──────────────────────────────────────────────────────────────
(function injectModal() {
    var div = document.createElement('div');
    div.innerHTML =
        '<div class="flow-logs-overlay" id="flowLogsOverlay">' +
            '<div class="flow-logs-modal">' +
                '<div class="flow-logs-header">' +
                    '<div>' +
                        '<div class="flow-logs-title" id="flowLogsTitle">API Logs</div>' +
                        '<div class="flow-logs-subtitle" id="flowLogsSubtitle"></div>' +
                    '</div>' +
                    '<button class="flow-logs-close" id="flowLogsClose">&times;</button>' +
                '</div>' +
                '<div class="flow-logs-body" id="flowLogsBody">' +
                    '<div class="flow-logs-loading">Loading...</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(div.firstChild);

    document.getElementById('flowLogsOverlay').addEventListener('click', function(e) {
        if (e.target === this) closeFlowLogsModal();
    });
    document.getElementById('flowLogsClose').addEventListener('click', closeFlowLogsModal);
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeFlowLogsModal();
    });
})();

// ── JSON parsing (handles single and double-encoded strings) ────────────────
function parseJson(str) {
    if (str == null) return null;
    if (typeof str === 'object') return str;   // already an object
    if (typeof str !== 'string' || str.trim() === '') return null;
    try {
        var v = JSON.parse(str);
        // If result is still a string it was double-encoded — decode once more
        if (typeof v === 'string') {
            try { v = JSON.parse(v); } catch (_) { /* leave as string */ }
        }
        return v;
    } catch (_) {
        return null;
    }
}

// ── JSON syntax highlighter ─────────────────────────────────────────────────
// Uses a character-by-character state machine so HTML escaping and token
// detection never interfere with each other.
function jsonHighlight(str) {
    if (str == null || str === '') {
        return '<span class="json-null">(empty)</span>';
    }

    var obj = parseJson(str);
    var src = obj !== null ? JSON.stringify(obj, null, 2) : str;
    var out = '';
    var i = 0;
    var n = src.length;

    function esc(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    while (i < n) {
        var ch = src[i];

        if (ch === '"') {
            // Consume a quoted JSON string
            var start = i;
            i++;
            while (i < n) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === '"')  { i++;    break;    }
                i++;
            }
            var token = src.slice(start, i);

            // A key is followed (possibly after whitespace) by a colon
            var rest = src.slice(i);
            var isKey = /^\s*:/.test(rest);

            out += isKey
                ? '<span class="json-key">'  + esc(token) + '</span>'
                : '<span class="json-str">'  + esc(token) + '</span>';

        } else if (ch === 't' && src.slice(i, i + 4) === 'true') {
            out += '<span class="json-bool">true</span>';
            i += 4;

        } else if (ch === 'f' && src.slice(i, i + 5) === 'false') {
            out += '<span class="json-bool">false</span>';
            i += 5;

        } else if (ch === 'n' && src.slice(i, i + 4) === 'null') {
            out += '<span class="json-null">null</span>';
            i += 4;

        } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
            // Consume a JSON number
            var numStart = i;
            if (src[i] === '-') i++;
            while (i < n && src[i] >= '0' && src[i] <= '9') i++;
            if (i < n && src[i] === '.') {
                i++;
                while (i < n && src[i] >= '0' && src[i] <= '9') i++;
            }
            if (i < n && (src[i] === 'e' || src[i] === 'E')) {
                i++;
                if (i < n && (src[i] === '+' || src[i] === '-')) i++;
                while (i < n && src[i] >= '0' && src[i] <= '9') i++;
            }
            out += '<span class="json-num">' + src.slice(numStart, i) + '</span>';

        } else {
            // Structural characters ({, }, [, ], :, ,) and whitespace/newlines
            out += esc(ch);
            i++;
        }
    }

    return out;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function prettyRaw(str) {
    var obj = parseJson(str);
    return obj !== null ? JSON.stringify(obj, null, 2) : (str || '');
}

var _copyIconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

var _checkIconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
    'stroke="#86efac" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="20 6 9 17 4 12"/></svg>';

function codeBlock(rawStr, blockId) {
    // Store raw pretty-printed text in a hidden textarea for reliable clipboard copy
    var raw = prettyRaw(rawStr);
    var highlighted = jsonHighlight(rawStr);
    return (
        '<div class="fle-code-wrap">' +
            '<button class="fle-copy-btn" title="Copy" onclick="copyFlowLogBlock(\'' + blockId + '\', this)">' +
                _copyIconSvg +
            '</button>' +
            '<pre class="fle-code-block" id="' + blockId + '">' + highlighted + '</pre>' +
            '<textarea style="display:none;position:absolute" id="' + blockId + '_raw">' +
                raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
            '</textarea>' +
        '</div>'
    );
}

function copyFlowLogBlock(blockId, btn) {
    var ta = document.getElementById(blockId + '_raw');
    var text = ta ? ta.value : '';
    var origIcon = btn.innerHTML;
    function onCopied() {
        btn.innerHTML = _checkIconSvg;
        btn.classList.add('copied');
        setTimeout(function() { btn.innerHTML = origIcon; btn.classList.remove('copied'); }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onCopied).catch(function() {
            fallbackCopy(text, onCopied);
        });
    } else {
        fallbackCopy(text, onCopied);
    }
}

function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    if (cb) cb();
}

// ── Log entry rendering ─────────────────────────────────────────────────────
function toggleFlowLogEntry(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
}

function renderFlowLogs(logs) {
    return logs.map(function(log, i) {
        var method = (log.httpMethod || 'GET').toUpperCase();
        var methodClass =
            method === 'GET'    ? 'fle-method-get'    :
            method === 'POST'   ? 'fle-method-post'   :
            method === 'PUT'    ? 'fle-method-put'     :
            method === 'PATCH'  ? 'fle-method-patch'   :
            method === 'DELETE' ? 'fle-method-delete'  : 'fle-method-other';

        var status = log.statusCode;
        var statusClass =
            !status        ? 'fle-status-err'   :
            status < 300   ? 'fle-status-2xx'   :
            status < 500   ? 'fle-status-4xx'   : 'fle-status-5xx';
        var statusLabel = status || (log.isError ? 'ERR' : '?');

        var path = log.path || '';
        var qs   = log.queryString ? '?' + log.queryString : '';
        var ts   = log.requestTimestamp ? new Date(log.requestTimestamp).toLocaleTimeString() : '';
        var dur  = log.durationMs != null ? log.durationMs + 'ms' : '';

        var id = 'fle_' + i;

        return (
            '<div class="flow-log-entry" id="' + id + '">' +
                '<div class="flow-log-entry-header" onclick="toggleFlowLogEntry(\'' + id + '\')">' +
                    '<span class="fle-method ' + methodClass + '">' + method + '</span>' +
                    '<span class="fle-path">' + escHtml(path + qs) + '</span>' +
                    '<span class="fle-status ' + statusClass + '">' + statusLabel + '</span>' +
                    (dur ? '<span class="fle-duration">' + dur + '</span>' : '') +
                    (ts  ? '<span class="fle-time">' + ts + '</span>' : '') +
                    '<span class="fle-chevron">&#9654;</span>' +
                '</div>' +
                '<div class="flow-log-entry-body">' +
                    (log.requestBody
                        ? '<div class="fle-section-label">Request Body</div>' + codeBlock(log.requestBody, id + '_req')
                        : '<div class="fle-meta-row"><strong>Request Body:</strong> (empty)</div>') +
                    '<div class="fle-section-label">Response Body</div>' +
                    codeBlock(log.responseBody, id + '_res') +
                '</div>' +
            '</div>'
        );
    }).join('');
}

// ── Modal open / close ──────────────────────────────────────────────────────
async function openFlowLogsModal(flowId, step, label) {
    var overlay = document.getElementById('flowLogsOverlay');
    var body    = document.getElementById('flowLogsBody');

    document.getElementById('flowLogsTitle').textContent    = label + ' \u2014 API Logs';
    document.getElementById('flowLogsSubtitle').textContent = 'Flow ID: ' + flowId + '  \u00b7  Step: ' + step;
    body.innerHTML = '<div class="flow-logs-loading">Loading logs\u2026</div>';
    overlay.classList.add('open');

    try {
        var url = API_BASE_URL +
            '/admin/customer-roadmap/flow-logs?flowId=' + encodeURIComponent(flowId) +
            '&step=' + encodeURIComponent(step);
        var resp = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + (sessionStorage.getItem('adminToken') || ''), 'accept': 'application/json' }
        });
        var data = await resp.json();

        // Support both camelCase and PascalCase API responses
        var ok   = data.isSuccess  !== undefined ? data.isSuccess  : data.IsSuccess;
        var det  = data.details    !== undefined ? data.details    : data.Details;

        if (!ok) {
            body.innerHTML = '<div class="flow-logs-empty">Failed to load logs.</div>';
            return;
        }

        var logs = (det && (det.logs || det.Logs)) || [];
        if (logs.length === 0) {
            body.innerHTML = '<div class="flow-logs-empty">No API logs found for this step.</div>';
            return;
        }

        body.innerHTML = renderFlowLogs(logs);
    } catch (err) {
        body.innerHTML = '<div class="flow-logs-empty">Error: ' + escHtml(err.message) + '</div>';
    }
}

function closeFlowLogsModal() {
    var overlay = document.getElementById('flowLogsOverlay');
    if (overlay) overlay.classList.remove('open');
}
