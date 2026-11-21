// dashboard/app.js — Client logic for Pre-Token Value Radar (100% offline, zero network requests)
(function () {
  'use strict';

  var data = window.RADAR;
  if (!data) return;

  var state = {
    search: '',
    category: 'all',
    chain: 'all',
    watchlistOnly: false,
    sortField: 'rank',
    sortAsc: true,
    activeTab: 'board',
    selectedRow: null,
  };

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function formatUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return usdFmt.format(n);
  }

  function formatPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function formatAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // Populate Meta & Counts
  var metaModel = document.getElementById('meta-model');
  if (metaModel) metaModel.textContent = data.model_version || 'radar-2-fitted';
  var metaDate = document.getElementById('meta-date');
  if (metaDate) metaDate.textContent = data.as_of;
  var countBoard = document.getElementById('count-board');
  if (countBoard) countBoard.textContent = data.board_size;
  var countLive = document.getElementById('count-live');
  if (countLive) countLive.textContent = data.live_size;
  var countWatchlist = document.getElementById('count-watchlist');
  if (countWatchlist) countWatchlist.textContent = data.watchlist_size;

  // Render KPI Strip
  function renderKpiStrip() {
    var strip = document.getElementById('kpi-strip');
    if (!strip) return;

    var totalImplied = 0;
    var changes = [];
    var catTvl = {};

    for (var i = 0; i < data.rows.length; i++) {
      var r = data.rows[i];
      totalImplied += r.implied_value_usd;
      if (typeof r.change_7d === 'number') changes.push(r.change_7d);
      var c = r.category || 'Uncategorized';
      catTvl[c] = (catTvl[c] || 0) + r.tvl_usd;
    }

    changes.sort(function (a, b) { return a - b; });
    var mid = Math.floor(changes.length / 2);
    var medianGrowth = changes.length ? (changes.length % 2 === 0 ? (changes[mid - 1] + changes[mid]) / 2 : changes[mid]) : 0;

    var topCat = 'None';
    var maxTvl = 0;
    for (var cat in catTvl) {
      if (catTvl[cat] > maxTvl) {
        maxTvl = catTvl[cat];
        topCat = cat;
      }
    }

    strip.innerHTML = [
      '<div class="kpi-card"><div class="kpi-label">Pre-Token Protocols</div><div class="kpi-value">' + data.board_size + '</div><div class="kpi-sub">40 watchlist + ' + data.early_size + ' early</div></div>',
      '<div class="kpi-card"><div class="kpi-label">Total Implied Value</div><div class="kpi-value">' + formatUsd(totalImplied) + '</div><div class="kpi-sub">Fitted empirical launch pricing</div></div>',
      '<div class="kpi-card"><div class="kpi-label">Median 7d Growth</div><div class="kpi-value ' + (medianGrowth >= 0 ? 'change-pos' : 'change-neg') + '">' + formatPct(medianGrowth) + '</div><div class="kpi-sub">Weekly TVL momentum</div></div>',
      '<div class="kpi-card"><div class="kpi-label">Dominant Sector</div><div class="kpi-value" style="font-size: 17px;">' + topCat + '</div><div class="kpi-sub">' + formatUsd(maxTvl) + ' TVL allocated</div></div>',
      '<div class="kpi-card"><div class="kpi-label">Live Benchmark Size</div><div class="kpi-value">' + data.live_size + '</div><div class="kpi-sub">Live market multiples sample</div></div>',
      '<div class="kpi-card"><div class="kpi-label">Sealed Snapshot</div><div class="kpi-value" style="font-size: 16px;">' + data.as_of + '</div><div class="kpi-sub">DefiLlama verified input</div></div>',
    ].join('');
  }

  // Populate Filter Selects
  function initFilters() {
    var catSelect = document.getElementById('select-category');
    var chainSelect = document.getElementById('select-chain');
    var categories = {};
    var chains = {};

    for (var i = 0; i < data.rows.length; i++) {
      var r = data.rows[i];
      if (r.category) categories[r.category] = true;
      if (r.chains) {
        for (var j = 0; j < r.chains.length; j++) chains[r.chains[j]] = true;
      }
    }

    var sortedCats = Object.keys(categories).sort();
    for (var cIdx = 0; cIdx < sortedCats.length; cIdx++) {
      var opt = document.createElement('option');
      opt.value = sortedCats[cIdx];
      opt.textContent = sortedCats[cIdx];
      catSelect.appendChild(opt);
    }

    var sortedChains = Object.keys(chains).sort();
    for (var chIdx = 0; chIdx < sortedChains.length; chIdx++) {
      var chOpt = document.createElement('option');
      chOpt.value = sortedChains[chIdx];
      chOpt.textContent = sortedChains[chIdx];
      chainSelect.appendChild(chOpt);
    }

    catSelect.addEventListener('change', function () {
      state.category = this.value;
      renderBoard();
    });

    chainSelect.addEventListener('change', function () {
      state.chain = this.value;
      renderBoard();
    });

    var searchInput = document.getElementById('input-search');
    searchInput.addEventListener('input', function () {
      state.search = this.value.trim().toLowerCase();
      renderBoard();
    });

    var watchlistCheck = document.getElementById('check-watchlist');
    watchlistCheck.addEventListener('change', function () {
      state.watchlistOnly = this.checked;
      renderBoard();
    });
  }

  // Sorting Table Headers
  function initSortHeaders() {
    var ths = document.querySelectorAll('#board-table th.sortable');
    ths.forEach(function (th) {
      th.addEventListener('click', function () {
        var field = this.getAttribute('data-sort');
        if (state.sortField === field) {
          state.sortAsc = !state.sortAsc;
        } else {
          state.sortField = field;
          state.sortAsc = field === 'rank' || field === 'name';
        }
        ths.forEach(function (t) {
          t.classList.remove('sorted-asc', 'sorted-desc');
        });
        this.classList.add(state.sortAsc ? 'sorted-asc' : 'sorted-desc');
        renderBoard();
      });
    });
  }

  // Filter & Sort Board Rows
  function getFilteredRows() {
    return data.rows.filter(function (r) {
      if (state.watchlistOnly && r.rank > data.watchlist_size) {
        // Watchlist slug check
        var isWatchlist = false;
        // Watchlist protocols have tvl >= floor_usd or are in top watchlist
        if (r.tvl_usd >= data.floor_usd) isWatchlist = true;
        if (!isWatchlist) return false;
      }
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all') {
        if (!r.chains || r.chains.indexOf(state.chain) === -1) return false;
      }
      if (state.search) {
        var q = state.search;
        var nameMatch = r.name && r.name.toLowerCase().indexOf(q) !== -1;
        var slugMatch = r.slug && r.slug.toLowerCase().indexOf(q) !== -1;
        var catMatch = r.category && r.category.toLowerCase().indexOf(q) !== -1;
        var chainMatch = r.chains && r.chains.some(function (ch) { return ch.toLowerCase().indexOf(q) !== -1; });
        if (!nameMatch && !slugMatch && !catMatch && !chainMatch) return false;
      }
      return true;
    }).sort(function (a, b) {
      var mul = state.sortAsc ? 1 : -1;
      switch (state.sortField) {
        case 'rank': return (a.rank - b.rank) * mul;
        case 'name': return a.name.localeCompare(b.name) * mul;
        case 'category': return ((a.category || '').localeCompare(b.category || '')) * mul;
        case 'tvl': return (a.tvl_usd - b.tvl_usd) * mul;
        case 'change': return ((a.change_7d || 0) - (b.change_7d || 0)) * mul;
        case 'implied': return (a.implied_value_usd - b.implied_value_usd) * mul;
        case 'age': return ((a.age_days || 0) - (b.age_days || 0)) * mul;
        default: return (a.rank - b.rank) * mul;
      }
    });
  }

  function renderBoard() {
    var tbody = document.getElementById('board-tbody');
    var footer = document.getElementById('board-footer');
    if (!tbody) return;

    var rows = getFilteredRows();
    tbody.innerHTML = '';

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--text-dim);">No protocols match your active filters.</td></tr>';
      if (footer) footer.innerHTML = '<span>Showing 0 of ' + data.board_size + ' protocols</span>';
      return;
    }

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tr = document.createElement('tr');
      tr.setAttribute('data-slug', r.slug);

      var isWatchlist = r.tvl_usd >= data.floor_usd;
      var chClass = r.change_7d > 0 ? 'change-pos' : r.change_7d < 0 ? 'change-neg' : 'change-flat';
      var chainsHtml = (r.chains || []).slice(0, 3).map(function (c) {
        return '<span class="chain-pill">' + c + '</span>';
      }).join('');
      if (r.chains && r.chains.length > 3) chainsHtml += '<span class="chain-pill">+' + (r.chains.length - 3) + '</span>';

      tr.innerHTML = [
        '<td><span class="rank-badge">#' + r.rank + '</span></td>',
        '<td><strong>' + r.name + '</strong>' + (isWatchlist ? '<span class="badge badge-watchlist">Watchlist</span>' : '') + '<div style="font-size: 11px; color: var(--text-dim);">' + r.slug + '</div></td>',
        '<td><span class="badge badge-category">' + (r.category || 'General') + '</span></td>',
        '<td>' + (chainsHtml || '—') + '</td>',
        '<td class="num-col">' + formatUsd(r.tvl_usd) + '</td>',
        '<td class="num-col ' + chClass + '">' + formatPct(r.change_7d) + '</td>',
        '<td class="num-col val-implied">' + formatUsd(r.implied_value_usd) + '</td>',
        '<td class="num-col">' + formatAge(r.age_days) + '</td>',
        '<td><button class="btn-inspect" data-slug="' + r.slug + '">View Plan</button></td>',
      ].join('');

      tr.addEventListener('click', function (e) {
        var slug = this.getAttribute('data-slug');
        openDetail(slug);
      });

      tbody.appendChild(tr);
    }

    if (footer) {
      footer.innerHTML = '<span>Showing ' + rows.length + ' of ' + data.board_size + ' protocols</span>' +
        '<span>Fitted multiple model: ' + data.model_version + '</span>';
    }
  }

  // Detail Modal
  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < data.rows.length; i++) {
      if (data.rows[i].slug === slug) {
        row = data.rows[i];
        break;
      }
    }
    if (!row) return;

    var backdrop = document.getElementById('modal-backdrop');
    var content = document.getElementById('modal-content');
    if (!backdrop || !content) return;

    var isWatchlist = row.tvl_usd >= data.floor_usd;
    var baseMultiple = row.category_multiple || data.model.global_base_multiple;
    var rawBaseVal = row.tvl_usd * baseMultiple;

    // Generate farm steps for this protocol
    var capital = row.tvl_usd >= 5e9 ? 250 : row.tvl_usd >= 1e9 ? 150 : row.tvl_usd >= 1e8 ? 100 : 50;
    var holdDays = row.age_days === null ? 30 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
    var chain = row.chains && row.chains.length ? row.chains[0] : 'mainnet';

    var steps = [
      { num: 1, action: 'Prepare a dedicated non-custodial wallet exclusively for ' + row.name + ' interactions, backed up offline.', cost: 'under $3 in network gas fees for initial funding', time: '5 minutes' },
      { num: 2, action: 'Deposit $' + capital + ' into ' + row.name + ' on ' + chain + ' according to its category standard position.', cost: '$' + capital + ' capital + ~$4-$8 in network gas', time: '15 minutes' },
      { num: 3, action: 'Execute one organic onchain interaction weekly on ' + chain + ' (small rebalance, harvest, or governance participation).', cost: 'approx $2/week in gas', time: '10 minutes weekly' },
      { num: 4, action: 'Maintain your active position continuously for at least ' + holdDays + ' days across multiple snapshot intervals.', cost: '$' + capital + ' remains deployed', time: holdDays + ' days' },
      { num: 5, action: 'Monitor official announcements and verify airdrop claims only through ' + row.name + ' verified domain, never third parties.', cost: 'zero fee, never pay to claim', time: '10 minutes inspection' },
      { num: 6, action: 'Log wallet public address, timestamped transactions, and contract hashes in an offline tracking journal.', cost: 'free', time: '5 minutes' }
    ];

    var stepsHtml = steps.map(function (s) {
      return '<div class="farm-step-card">' +
        '<div class="step-number">' + s.num + '</div>' +
        '<div class="step-details">' +
        '<div class="step-text">' + s.action + '</div>' +
        '<div class="step-meta"><span><strong>Cost:</strong> ' + s.cost + '</span><span><strong>Time:</strong> ' + s.time + '</span></div>' +
        '</div></div>';
    }).join('');

    content.innerHTML = [
      '<div class="modal-header-section">',
      '<div class="modal-title-row">',
      '<h2>' + row.name + '</h2>',
      '<span class="badge badge-category">' + (row.category || 'General') + '</span>',
      isWatchlist ? '<span class="badge badge-watchlist">Watchlist ($50M+ Floor)</span>' : '',
      '</div>',
      '<div class="modal-subtitle">Slug: <code>' + row.slug + '</code> · Listed: ' + (row.listed_at || 'Undisclosed') + ' · Age: ' + formatAge(row.age_days) + '</div>',
      '</div>',

      '<div class="calc-breakdown-card">',
      '<h3>Valuation Breakdown (Fitted Launch Pricing)</h3>',
      '<div class="calc-grid">',
      '<div class="calc-item"><span class="item-label">Reported TVL</span><span class="item-val">' + formatUsd(row.tvl_usd) + '</span></div>',
      '<div class="calc-item"><span class="item-label">Fitted Category Multiple</span><span class="item-val">' + baseMultiple.toFixed(4) + 'x</span></div>',
      '<div class="calc-item"><span class="item-label">Base Pre-Token Value</span><span class="item-val">' + formatUsd(rawBaseVal) + '</span></div>',
      '<div class="calc-item"><span class="item-label">Growth Multiplier (' + formatPct(row.change_7d) + ')</span><span class="item-val">' + row.growth_multiplier.toFixed(4) + 'x</span></div>',
      '<div class="calc-item"><span class="item-label">Maturity Multiplier (' + formatAge(row.age_days) + ')</span><span class="item-val">' + row.maturity_multiplier.toFixed(4) + 'x</span></div>',
      '<div class="calc-item"><span class="item-label">Implied Market Value</span><span class="item-val val-implied" style="font-size: 20px;">' + formatUsd(row.implied_value_usd) + '</span></div>',
      '</div>',
      '<div class="calc-formula-note">Formula: Implied = max(1, round(TVL × ' + baseMultiple.toFixed(4) + ' × ' + row.growth_multiplier.toFixed(4) + ' × ' + row.maturity_multiplier.toFixed(4) + '))</div>',
      '</div>',

      '<div class="farm-plan-section">',
      '<h3>Concrete Farming Roadmap (6 Steps)</h3>',
      stepsHtml,
      '</div>'
    ].join('');

    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    var backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    document.body.style.overflow = '';
  }

  var closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  var backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
  }

  // Render Live Tokens Table
  function renderLiveTable() {
    var tbody = document.getElementById('live-tbody');
    if (!tbody || !data.live) return;

    var rows = data.live.slice(0, 100);
    tbody.innerHTML = '';

    for (var i = 0; i < rows.length; i++) {
      var p = rows[i];
      var tr = document.createElement('tr');
      var chClass = p.change_7d > 0 ? 'change-pos' : p.change_7d < 0 ? 'change-neg' : 'change-flat';
      var chainsHtml = (p.chains || []).slice(0, 2).map(function (c) {
        return '<span class="chain-pill">' + c + '</span>';
      }).join('');

      tr.innerHTML = [
        '<td class="num-col">' + (i + 1) + '</td>',
        '<td><strong>' + p.name + '</strong><div style="font-size: 11px; color: var(--text-dim);">' + p.slug + '</div></td>',
        '<td><span class="badge badge-category">' + (p.category || 'General') + '</span></td>',
        '<td>' + (chainsHtml || '—') + '</td>',
        '<td class="num-col">' + formatUsd(p.mcap_usd) + '</td>',
        '<td class="num-col">' + formatUsd(p.tvl_usd) + '</td>',
        '<td class="num-col val-implied">' + (p.ratio ? p.ratio.toFixed(4) + 'x' : 'n/a') + '</td>',
        '<td class="num-col ' + chClass + '">' + formatPct(p.change_7d) + '</td>',
      ].join('');

      tbody.appendChild(tr);
    }
  }

  // Render Model Explainer Tab
  function renderModelExplainer() {
    var container = document.getElementById('model-content');
    if (!container) return;

    var mults = data.model.category_multiples || {};
    var rowsHtml = '';
    for (var cat in mults) {
      rowsHtml += '<tr><td><strong>' + cat + '</strong></td><td class="num-col">' + mults[cat].toFixed(4) + 'x</td><td>Category median from live protocols</td></tr>';
    }
    rowsHtml += '<tr style="background: rgba(6, 182, 212, 0.08); font-weight: 700;"><td><strong>Global Baseline Fallback</strong></td><td class="num-col">' + data.model.global_base_multiple.toFixed(4) + 'x</td><td>All live protocols median across DeFi</td></tr>';

    container.innerHTML = [
      '<h2>Empirical Launch Pricing (Model ' + data.model_version + ')</h2>',
      '<p>Instead of hardcoding subjective multiples, <strong>Pre-Token Value Radar</strong> derives market pricing at runtime from DefiLlama\'s snapshot of ' + data.live_size + ' live-token protocols. For each sector with at least 3 active tokens, the model calculates the median Market Cap / TVL ratio.</p>',
      '<table class="multiples-table">',
      '<thead><tr><th>Category</th><th class="num-col">Fitted Base Multiple</th><th>Basis</th></tr></thead>',
      '<tbody>' + rowsHtml + '</tbody>',
      '</table>',
      '<h3 style="margin: 20px 0 10px; color: #ffffff;">The Valuation Formula</h3>',
      '<p>Every pre-token protocol\'s implied valuation is calculated through four deterministic factors derived from its snapshot data:</p>',
      '<div style="background: var(--bg-input); padding: 14px; border-radius: 6px; font-family: monospace; font-size: 13px; line-height: 1.8; color: var(--accent-cyan); margin-bottom: 16px;">',
      '1. Base = TVL × Fitted Category Multiple (or ' + data.model.global_base_multiple.toFixed(4) + 'x global fallback)<br>',
      '2. Growth = clamp(7d Change, -60%, +120%)<br>',
      '3. Growth Multiplier = 1 + (Growth / 100) × 0.5<br>',
      '4. Maturity Multiplier = 0.6 + min(Age Days, 1095) / 1095 × 0.4<br>',
      '<strong>Implied Market Value = max(1, round(Base × Growth Multiplier × Maturity Multiplier))</strong>',
      '</div>',
      '<p><em>Notice on Token Status:</em> Protocols in this radar "record no token" in DefiLlama\'s registry (both Gecko ID and Symbol are null). This reflects publicly indexed records rather than an absolute legal warranty that no private instrument exists.</p>'
    ].join('');
  }

  // View Tab Switching
  function initTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    var panels = {
      board: document.getElementById('panel-board'),
      live: document.getElementById('panel-live'),
      model: document.getElementById('panel-model'),
    };

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = this.getAttribute('data-tab');
        state.activeTab = target;

        tabs.forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');

        for (var p in panels) {
          if (panels[p]) {
            panels[p].style.display = p === target ? 'block' : 'none';
          }
        }

        if (target === 'live') renderLiveTable();
        if (target === 'model') renderModelExplainer();
      });
    });
  }

  // Keyboard Navigation
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
    if (e.key === '/' && document.activeElement !== document.getElementById('input-search')) {
      var searchEl = document.getElementById('input-search');
      if (searchEl) {
        e.preventDefault();
        searchEl.focus();
      }
    }
  });

  // Initialization
  renderKpiStrip();
  initFilters();
  initSortHeaders();
  initTabs();
  renderBoard();
})();
