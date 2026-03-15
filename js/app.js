// ===== ReloAssistant — Dashboard Logic v1.2 =====

(function () {
    'use strict';

    // ===== Config =====
    const GOOGLE_SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT0W9OeoTIqSg46yVGMUV4Kc3efIjtuVpy3YDEgdhCr8BlBvH3oSBb6Ny5TF87FPVR98V1Vss9NZvJ9/pub?output=csv';
    const SYNC_API_URL = '/api/sync'; // Local proxy fallback (see server.py)
    const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
    const SYNC_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute if auto-sync is needed

    // ===== State =====
    let tasks = [];
    let filteredTasks = [];
    let sortColumn = 'ETA';
    let sortDirection = 'asc';
    const DEFAULT_DISPLAY_LIMIT = 10;
    let displayLimit = DEFAULT_DISPLAY_LIMIT;
    let showingAll = false;
    let statusChart = null;
    let categoryChart = null;
    let timelineChart = null;
    let isSyncing = false;
    let syncCheckTimer = null;
    let activeCardFilter = null; // 'in-progress' | 'overdue' | 'blocked' | 'due-soon' | null

    // ===== Category Config =====
    const CATEGORY_CONFIG = {
        'Visa/Immigration': { emoji: '🛂', cssClass: 'cat-visa' },
        'Housing':          { emoji: '🏠', cssClass: 'cat-housing' },
        'Banking/Finance':  { emoji: '🏦', cssClass: 'cat-banking' },
        'Banking':          { emoji: '🏦', cssClass: 'cat-banking' },
        'Finance':          { emoji: '💰', cssClass: 'cat-finance' },
        'Healthcare':       { emoji: '🏥', cssClass: 'cat-healthcare' },
        'Kids/School':      { emoji: '🎒', cssClass: 'cat-kids' },
        'Shipping/Moving':  { emoji: '📦', cssClass: 'cat-shipping' },
        'Utilities':        { emoji: '⚡', cssClass: 'cat-utilities' },
        'DMV/Driving':      { emoji: '🚗', cssClass: 'cat-dmv' },
        'Car':              { emoji: '🚗', cssClass: 'cat-car' },
        'General':          { emoji: '📌', cssClass: 'cat-general' },
        'Tax':              { emoji: '🧾', cssClass: 'cat-tax' },
        'Bella':            { emoji: '🐕', cssClass: 'cat-bella' },
    };

    // ===== DOM Elements =====
    const dropZone = document.getElementById('drop-zone');
    const dashboard = document.getElementById('dashboard');
    const csvFileInput = document.getElementById('csv-file-input');
    const clearDataBtn = document.getElementById('clear-data-btn');

    // Sync
    const syncBtn = document.getElementById('sync-btn');
    const syncIcon = document.getElementById('sync-icon');
    const syncStatus = document.getElementById('sync-status');
    const dropSyncBtn = document.getElementById('drop-sync-btn');

    // Summary
    const summarySentence = document.getElementById('summary-sentence');

    // Cards
    const totalTasksEl = document.getElementById('total-tasks');
    const completionPctEl = document.getElementById('completion-pct');
    const inProgressTasksEl = document.getElementById('in-progress-tasks');
    const overdueTasksEl = document.getElementById('overdue-tasks');
    const blockedTasksEl = document.getElementById('blocked-tasks');
    const dueSoonTasksEl = document.getElementById('due-soon-tasks');

    // Progress
    const progressBarDone = document.getElementById('progress-bar-done');
    const progressBarInProgress = document.getElementById('progress-bar-in-progress');
    const progressText = document.getElementById('progress-text');

    // Assignee
    const maorStats = document.getElementById('maor-stats');
    const omerStats = document.getElementById('omer-stats');
    const maorSegmentedBar = document.getElementById('maor-segmented-bar');
    const omerSegmentedBar = document.getElementById('omer-segmented-bar');
    const maorProgressText = document.getElementById('maor-progress-text');
    const omerProgressText = document.getElementById('omer-progress-text');

    // Filters
    const filterCategory = document.getElementById('filter-category');
    const filterAssignee = document.getElementById('filter-assignee');
    const filterPriority = document.getElementById('filter-priority');
    const filterStatus = document.getElementById('filter-status');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');

    // Table
    const taskTableBody = document.getElementById('task-table-body');
    const showingCount = document.getElementById('showing-count');
    const totalCount = document.getElementById('total-count');

    // Footer
    const lastLoaded = document.getElementById('last-loaded');

    // Insights
    const insightsSection = document.getElementById('insights-section');

    // ===== Initialization =====
    function init() {
        setupEventListeners();
        loadFromLocalStorage();
        // Auto-sync: check on load and start periodic check
        checkAutoSync();
        syncCheckTimer = setInterval(checkAutoSync, SYNC_CHECK_INTERVAL_MS);
    }

    function setupEventListeners() {
        // Sync buttons
        syncBtn.addEventListener('click', () => syncFromGoogleSheets(true));
        dropSyncBtn.addEventListener('click', () => syncFromGoogleSheets(true));

        // File input
        csvFileInput.addEventListener('change', handleFileSelect);

        // Drag and drop
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('dragleave', handleDragLeave);
        dropZone.addEventListener('drop', handleDrop);

        // Also allow drag-drop on the whole page when dashboard is visible
        document.body.addEventListener('dragover', handleBodyDragOver);
        document.body.addEventListener('drop', handleBodyDrop);

        // Clear data
        clearDataBtn.addEventListener('click', clearData);

        // Filters — clear card filter when user manually changes dropdowns
        filterCategory.addEventListener('change', () => { clearCardHighlight(); showingAll = false; applyFilters(); });
        filterAssignee.addEventListener('change', () => { clearCardHighlight(); showingAll = false; applyFilters(); });
        filterPriority.addEventListener('change', () => { clearCardHighlight(); showingAll = false; applyFilters(); });
        filterStatus.addEventListener('change', () => { clearCardHighlight(); showingAll = false; applyFilters(); });
        resetFiltersBtn.addEventListener('click', resetFilters);

        // Show More button
        const showMoreBtn = document.getElementById('show-more-btn');
        if (showMoreBtn) {
            showMoreBtn.addEventListener('click', toggleShowMore);
        }

        // Table sorting
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.sort;
                if (sortColumn === column) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColumn = column;
                    sortDirection = 'asc';
                }
                updateSortArrows();
                applyFilters();
            });
        });

        // Clickable summary cards — filter task table
        document.querySelectorAll('.card-clickable[data-card-filter]').forEach(card => {
            card.addEventListener('click', () => {
                const filterType = card.dataset.cardFilter;
                handleCardFilterClick(filterType);
            });
        });
    }

    // ===== Card Filter Logic =====
    function handleCardFilterClick(filterType) {
        // Toggle: if same card clicked again, clear the filter
        if (activeCardFilter === filterType) {
            clearCardFilter();
            return;
        }

        // Clear any previous card filter highlight
        document.querySelectorAll('.card-clickable').forEach(c => c.classList.remove('card-active'));

        // Set the new card filter
        activeCardFilter = filterType;

        // Highlight the active card
        const activeCard = document.querySelector(`[data-card-filter="${filterType}"]`);
        if (activeCard) activeCard.classList.add('card-active');

        // For status-based filters (in-progress, blocked), also set the dropdown
        if (filterType === 'in-progress') {
            filterStatus.value = 'In Progress';
        } else if (filterType === 'blocked') {
            filterStatus.value = 'Blocked';
        } else {
            // For overdue/due-soon, clear the status dropdown since these are date-based
            filterStatus.value = '';
        }

        // Clear other dropdowns to avoid conflicting filters
        filterCategory.value = '';
        filterAssignee.value = '';
        filterPriority.value = '';

        applyFilters();

        // Scroll to the task table
        const filtersSection = document.querySelector('.filters-section');
        if (filtersSection) {
            filtersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function clearCardFilter() {
        activeCardFilter = null;
        document.querySelectorAll('.card-clickable').forEach(c => c.classList.remove('card-active'));
        resetFilters();
    }

    function clearCardHighlight() {
        // Clear card filter state and highlight without resetting dropdowns
        activeCardFilter = null;
        document.querySelectorAll('.card-clickable').forEach(c => c.classList.remove('card-active'));
    }

    // ===== File Handling =====
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) parseCSVFile(file);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) {
            parseCSVFile(file);
        }
    }

    function handleBodyDragOver(e) {
        e.preventDefault();
    }

    function handleBodyDrop(e) {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) {
            parseCSVFile(file);
        }
    }

    function parseCSVFile(file) {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                if (results.data && results.data.length > 0) {
                    tasks = cleanData(results.data);
                    saveToLocalStorage();
                    renderDashboard();
                }
            },
            error: function (err) {
                console.error('CSV parse error:', err);
                alert('Error parsing CSV file. Please check the format.');
            }
        });
    }

    // ===== Google Sheets Sync =====
    async function syncFromGoogleSheets(isManual = false) {
        if (isSyncing) return;
        isSyncing = true;

        // UI feedback
        syncBtn.disabled = true;
        syncIcon.classList.add('spinning');
        setSyncStatus('Syncing...', '');

        console.log('[DEBUG-SYNC] Starting sync, isManual:', isManual);

        try {
            let csvText = null;

            // Strategy: try direct Google Sheets URL first (works on GitHub Pages),
            // fall back to local proxy (works on localhost)
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            if (!isLocalhost) {
                // On GitHub Pages or any hosted environment — fetch directly from Google Sheets
                console.log('[DEBUG-SYNC] Trying direct Google Sheets URL...');
                try {
                    const directUrl = GOOGLE_SHEETS_CSV_URL + '&_t=' + Date.now();
                    const response = await fetch(directUrl);
                    if (response.ok) {
                        csvText = await response.text();
                        console.log('[DEBUG-SYNC] Direct fetch succeeded, length:', csvText.length);
                    }
                } catch (directErr) {
                    console.warn('[DEBUG-SYNC] Direct fetch failed:', directErr.message);
                }
            }

            // If direct fetch didn't work (or we're on localhost), try the proxy
            if (!csvText) {
                if (window.location.protocol === 'file:') {
                    throw new Error(
                        'Page opened via file:// protocol. Access via http://localhost:8080 or the GitHub Pages URL.'
                    );
                }
                console.log('[DEBUG-SYNC] Trying local proxy...');
                const proxyUrl = SYNC_API_URL + '?_t=' + Date.now();
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    const errorData = await response.text();
                    throw new Error(errorData || `HTTP ${response.status}`);
                }
                csvText = await response.text();
                console.log('[DEBUG-SYNC] Proxy fetch succeeded, length:', csvText.length);
            }

            // Parse CSV text with PapaParse
            const results = Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true
            });

            console.log('[DEBUG-SYNC] PapaParse results - data rows:', results.data ? results.data.length : 'null');

            if (results.data && results.data.length > 0) {
                tasks = cleanData(results.data);
                console.log('[DEBUG-SYNC] After cleanData, tasks count:', tasks.length);
                saveToLocalStorage();
                saveSyncTimestamp();
                renderDashboard();
                const msg = `Synced ${tasks.length} tasks`;
                setSyncStatus(msg, 'success');
                console.log(`[ReloAssistant] ${msg} at ${new Date().toLocaleString()}`);
            } else {
                throw new Error('No data found in the sheet');
            }
        } catch (err) {
            console.error('[ReloAssistant] Sync error:', err);
            const shortMsg = err.message.length > 60 ? err.message.substring(0, 60) + '...' : err.message;
            const msg = isManual ? `Sync failed: ${shortMsg}` : `Auto-sync failed: ${shortMsg}`;
            setSyncStatus(msg, 'error');

            if (isManual) {
                alert(`Failed to sync from Google Sheets:\n${err.message}\n\nYou can try uploading a CSV file manually.`);
            }
        } finally {
            isSyncing = false;
            syncBtn.disabled = false;
            syncIcon.classList.remove('spinning');

            // Clear status message after 10 seconds
            setTimeout(() => {
                const lastSync = getLastSyncTimestamp();
                if (lastSync) {
                    setSyncStatus('Last sync: ' + formatTimeAgo(lastSync), '');
                }
            }, 10000);
        }
    }

    function checkAutoSync() {
        const lastSync = getLastSyncTimestamp();
        if (!lastSync) {
            // Never synced before — sync now
            syncFromGoogleSheets(false);
            return;
        }

        const elapsed = Date.now() - new Date(lastSync).getTime();
        if (elapsed >= AUTO_SYNC_INTERVAL_MS) {
            console.log('[ReloAssistant] Auto-sync triggered (last sync was ' + formatTimeAgo(lastSync) + ')');
            syncFromGoogleSheets(false);
        } else {
            // Update the status display with time since last sync
            setSyncStatus('Last sync: ' + formatTimeAgo(lastSync), '');
        }
    }

    function saveSyncTimestamp() {
        localStorage.setItem('reloassistant_last_sync', new Date().toISOString());
    }

    function getLastSyncTimestamp() {
        return localStorage.getItem('reloassistant_last_sync');
    }

    function setSyncStatus(message, type) {
        syncStatus.textContent = message;
        syncStatus.className = 'sync-status';
        if (type) {
            syncStatus.classList.add(type);
        }
    }

    function formatTimeAgo(isoStr) {
        const now = Date.now();
        const then = new Date(isoStr).getTime();
        const diffMs = now - then;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return diffMin + 'm ago';
        if (diffHr < 24) return diffHr + 'h ago';
        return diffDay + 'd ago';
    }

    // ===== Data Cleaning =====
    function cleanData(data) {
        return data.map(row => {
            const cleaned = {};
            Object.keys(row).forEach(key => {
                cleaned[key.trim()] = (row[key] || '').trim();
            });
            return cleaned;
        }).filter(row => row.Task && row.Task.length > 0);
    }

    // ===== LocalStorage =====
    function saveToLocalStorage() {
        const payload = {
            tasks: tasks,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('reloassistant_data', JSON.stringify(payload));
    }

    function loadFromLocalStorage() {
        const stored = localStorage.getItem('reloassistant_data');
        if (stored) {
            try {
                const payload = JSON.parse(stored);
                tasks = payload.tasks || [];
                if (tasks.length > 0) {
                    renderDashboard();
                    if (payload.timestamp) {
                        lastLoaded.textContent = formatDateTime(payload.timestamp);
                    }
                }
            } catch (e) {
                console.error('Error loading from localStorage:', e);
            }
        }
    }

    function clearData() {
        if (confirm('Clear all loaded data?')) {
            tasks = [];
            filteredTasks = [];
            localStorage.removeItem('reloassistant_data');
            dashboard.classList.add('hidden');
            dropZone.classList.remove('hidden');
            lastLoaded.textContent = 'Never';
            csvFileInput.value = '';
        }
    }

    // ===== Relocation Timeline Bar =====
    const RELO_START = new Date(2026, 2, 1);  // March 1, 2026
    const RELO_END   = new Date(2026, 6, 15); // July 15, 2026
    const RELO_TOTAL_DAYS = Math.round((RELO_END - RELO_START) / 86400000); // 136 days

    function updateRelocationTimeline() {
        const section = document.getElementById('relocation-timeline');
        const fillEl = document.getElementById('relo-timeline-fill');
        const planeEl = document.getElementById('relo-timeline-plane');
        const infoEl = document.getElementById('relo-timeline-info');
        const monthsEl = document.getElementById('relo-timeline-months');
        const dividersEl = document.getElementById('relo-timeline-dividers');

        if (!section || !fillEl || !planeEl) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calculate progress
        const elapsed = today - RELO_START;
        const total = RELO_END - RELO_START;
        let pct = (elapsed / total) * 100;
        pct = Math.max(0, Math.min(100, pct));

        const dayNumber = Math.max(0, Math.ceil(elapsed / 86400000));
        const daysLeft = Math.max(0, Math.ceil((RELO_END - today) / 86400000));

        // Set fill width and plane position
        fillEl.style.width = pct + '%';
        planeEl.style.left = pct + '%';

        // Update info text
        if (today < RELO_START) {
            const daysUntil = Math.ceil((RELO_START - today) / 86400000);
            infoEl.textContent = `Starts in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
        } else if (today >= RELO_END) {
            infoEl.textContent = '🎉 You\'ve arrived!';
            section.classList.add('relo-arrived');
        } else {
            infoEl.textContent = `Day ${dayNumber} of ${RELO_TOTAL_DAYS} · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} to go`;
        }

        // Render month labels with proportional widths
        const months = [
            { label: 'Mar', start: new Date(2026, 2, 1),  end: new Date(2026, 3, 1) },
            { label: 'Apr', start: new Date(2026, 3, 1),  end: new Date(2026, 4, 1) },
            { label: 'May', start: new Date(2026, 4, 1),  end: new Date(2026, 5, 1) },
            { label: 'Jun', start: new Date(2026, 5, 1),  end: new Date(2026, 6, 1) },
            { label: 'Jul', start: new Date(2026, 6, 1),  end: new Date(2026, 6, 15) },
        ];

        const currentMonth = today.getMonth(); // 0-indexed
        const currentYear = today.getFullYear();

        monthsEl.innerHTML = months.map(m => {
            const mDays = (m.end - m.start) / 86400000;
            const widthPct = (mDays / RELO_TOTAL_DAYS) * 100;
            const isCurrent = (m.start.getMonth() === currentMonth && m.start.getFullYear() === currentYear);
            return `<span class="relo-month-label${isCurrent ? ' current-month' : ''}" style="width:${widthPct}%">${m.label}</span>`;
        }).join('');

        // Render divider lines at month boundaries
        const dividers = [
            new Date(2026, 3, 1),  // Apr 1
            new Date(2026, 4, 1),  // May 1
            new Date(2026, 5, 1),  // Jun 1
            new Date(2026, 6, 1),  // Jul 1
        ];

        dividersEl.innerHTML = dividers.map(d => {
            const pos = ((d - RELO_START) / total) * 100;
            return `<div class="relo-divider" style="left:${pos}%"></div>`;
        }).join('');
    }

    // ===== Render Dashboard =====
    function renderDashboard() {
        dropZone.classList.add('hidden');
        dashboard.classList.remove('hidden');

        updateRelocationTimeline();
        updateSummary();
        updateInsights();
        updateCards();
        updateProgressBar();
        updateCharts();
        updateAssigneeSection();
        populateCategoryFilter();
        updateSortArrows();
        applyFilters();
        updateLastLoaded();
    }

    // ===== Summary Sentence =====
    function updateSummary() {
        const total = tasks.length;
        const done = tasks.filter(t => t.Status === 'Done').length;
        const inProgress = tasks.filter(t => t.Status === 'In Progress').length;
        const overdue = getOverdueTasks().length;
        const dueSoon = getDueSoonTasks().length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        let parts = [];
        parts.push(`You have <span class="highlight">${total} tasks</span> total`);
        
        if (done > 0) {
            parts.push(`<span class="highlight">${done} completed</span> (${pct}%)`);
        }
        if (inProgress > 0) {
            parts.push(`<span class="highlight">${inProgress} in progress</span>`);
        }
        if (overdue > 0) {
            parts.push(`<span class="highlight" style="background:rgba(239,68,68,0.3)">${overdue} overdue</span>`);
        }
        if (dueSoon > 0) {
            parts.push(`<span class="highlight" style="background:rgba(245,158,11,0.3)">${dueSoon} due this week</span>`);
        }

        summarySentence.innerHTML = parts.join(' · ') + '.';
    }

    // ===== Insights Section =====
    function updateInsights() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const overdueTasks = tasks.filter(t => isTaskOverdue(t, today));
        const dueSoonTasks = tasks.filter(t => isTaskDueSoon(t, today));

        let html = '';

        if (overdueTasks.length > 0) {
            const taskItems = overdueTasks.slice(0, 5).map(t => {
                const eta = formatDate(t.ETA);
                return `<li><strong>${escapeHtml(t.Task)}</strong> (was due ${eta}, ${escapeHtml(t.Assignee || 'unassigned')})</li>`;
            }).join('');
            const moreText = overdueTasks.length > 5 ? `<li class="insight-more">...and ${overdueTasks.length - 5} more</li>` : '';
            html += `<div class="insight-item">
                <span class="insight-icon">🚨</span>
                <div class="insight-text insight-overdue">
                    <strong>${overdueTasks.length} task${overdueTasks.length > 1 ? 's are' : ' is'} overdue:</strong>
                    <ul class="insight-task-list">${taskItems}${moreText}</ul>
                </div>
            </div>`;
        }

        if (dueSoonTasks.length > 0) {
            const taskItems = dueSoonTasks.slice(0, 5).map(t => {
                const eta = formatDate(t.ETA);
                return `<li><strong>${escapeHtml(t.Task)}</strong> (due ${eta}, ${escapeHtml(t.Assignee || 'unassigned')})</li>`;
            }).join('');
            const moreText = dueSoonTasks.length > 5 ? `<li class="insight-more">...and ${dueSoonTasks.length - 5} more</li>` : '';
            html += `<div class="insight-item">
                <span class="insight-icon">⏰</span>
                <div class="insight-text insight-due-soon">
                    <strong>${dueSoonTasks.length} task${dueSoonTasks.length > 1 ? 's' : ''} due this week:</strong>
                    <ul class="insight-task-list">${taskItems}${moreText}</ul>
                </div>
            </div>`;
        }

        if (overdueTasks.length === 0 && dueSoonTasks.length === 0) {
            html = `<div class="insight-item">
                <span class="insight-icon">✅</span>
                <span class="insight-text insight-ok">
                    <strong>You're on track!</strong> No overdue or urgent tasks right now.
                </span>
            </div>`;
        }

        insightsSection.innerHTML = html;
    }

    // ===== Summary Cards =====
    function updateCards() {
        const total = tasks.length;
        const done = tasks.filter(t => t.Status === 'Done').length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const inProgress = tasks.filter(t => t.Status === 'In Progress').length;
        const overdue = getOverdueTasks().length;
        const blocked = tasks.filter(t => t.Status === 'Blocked').length;
        const dueSoon = getDueSoonTasks().length;

        totalTasksEl.textContent = total;
        completionPctEl.textContent = pct + '%';
        inProgressTasksEl.textContent = inProgress;
        overdueTasksEl.textContent = overdue;
        blockedTasksEl.textContent = blocked;
        dueSoonTasksEl.textContent = dueSoon;
    }

    // ===== Progress Bar (Segmented) =====
    function updateProgressBar() {
        const total = tasks.length;
        const done = tasks.filter(t => t.Status === 'Done').length;
        const inProgress = tasks.filter(t => t.Status === 'In Progress').length;
        const donePct = total > 0 ? (done / total) * 100 : 0;
        const inProgressPct = total > 0 ? (inProgress / total) * 100 : 0;

        progressBarDone.style.width = donePct + '%';
        progressBarInProgress.style.width = inProgressPct + '%';
        progressText.textContent = `${done} done · ${inProgress} in progress · ${total - done - inProgress} remaining`;
    }

    // ===== Charts =====
    function updateCharts() {
        updateTimelineChart();
        updateStatusChart();
        updateCategoryChart();
    }

    // ===== Monthly Timeline Chart =====
    function updateTimelineChart() {
        // Group tasks by month based on ETA
        const monthMap = {}; // key: 'YYYY-MM', value: { done, inProgress, notStarted, blocked }

        tasks.forEach(t => {
            if (!t.ETA) return;
            const d = new Date(t.ETA);
            if (isNaN(d.getTime())) return;
            const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

            if (!monthMap[key]) {
                monthMap[key] = { done: 0, inProgress: 0, notStarted: 0, blocked: 0 };
            }

            switch (t.Status) {
                case 'Done': monthMap[key].done++; break;
                case 'In Progress': monthMap[key].inProgress++; break;
                case 'Blocked': monthMap[key].blocked++; break;
                default: monthMap[key].notStarted++; break;
            }
        });

        // Sort months chronologically
        const sortedMonths = Object.keys(monthMap).sort();
        if (sortedMonths.length === 0) return;

        // Format month labels nicely
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const labels = sortedMonths.map(key => {
            const [year, month] = key.split('-');
            return monthNames[parseInt(month) - 1] + ' ' + year;
        });

        // Find which month index is "current month" for the today marker
        const now = new Date();
        const currentMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const todayIndex = sortedMonths.indexOf(currentMonthKey);

        const ctx = document.getElementById('timeline-chart').getContext('2d');

        if (timelineChart) {
            timelineChart.destroy();
        }

        // Build annotation for "today" line
        const annotationPlugin = {
            id: 'todayLine',
            afterDraw: function(chart) {
                if (todayIndex < 0) return;
                const xAxis = chart.scales.x;
                const yAxis = chart.scales.y;
                const x = xAxis.getPixelForValue(todayIndex);
                const ctx = chart.ctx;

                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.moveTo(x, yAxis.top);
                ctx.lineTo(x, yAxis.bottom);
                ctx.stroke();

                // Label
                ctx.fillStyle = '#ef4444';
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('📍 Today', x, yAxis.top - 6);
                ctx.restore();
            }
        };

        timelineChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Done',
                        data: sortedMonths.map(k => monthMap[k].done),
                        backgroundColor: '#10b981',
                        borderRadius: 4
                    },
                    {
                        label: 'In Progress',
                        data: sortedMonths.map(k => monthMap[k].inProgress),
                        backgroundColor: '#3b82f6',
                        borderRadius: 4
                    },
                    {
                        label: 'Not Started',
                        data: sortedMonths.map(k => monthMap[k].notStarted),
                        backgroundColor: '#d1d5db',
                        borderRadius: 4
                    },
                    {
                        label: 'Blocked',
                        data: sortedMonths.map(k => monthMap[k].blocked),
                        backgroundColor: '#8b5cf6',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y', // Horizontal bars
                scales: {
                    x: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            font: { family: 'Inter', size: 11 }
                        },
                        grid: { color: '#f1f5f9' },
                        title: {
                            display: true,
                            text: 'Number of Tasks',
                            font: { family: 'Inter', size: 12, weight: '600' },
                            color: '#6b7280'
                        }
                    },
                    y: {
                        stacked: true,
                        ticks: {
                            font: { family: 'Inter', size: 13, weight: '600' },
                            color: function(context) {
                                // Highlight current month
                                if (context.index === todayIndex) return '#ef4444';
                                return '#374151';
                            }
                        },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        align: 'center',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            pointStyleWidth: 16,
                            boxHeight: 10,
                            font: { family: 'Inter', size: 13, weight: '600' },
                            color: '#374151'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: 'Inter', size: 13, weight: '600' },
                        bodyFont: { family: 'Inter', size: 12 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        boxPadding: 6,
                        callbacks: {
                            afterTitle: function(items) {
                                const monthIdx = items[0].dataIndex;
                                const key = sortedMonths[monthIdx];
                                const data = monthMap[key];
                                const total = data.done + data.inProgress + data.notStarted + data.blocked;
                                return `Total: ${total} tasks`;
                            }
                        }
                    }
                }
            },
            plugins: [annotationPlugin]
        });
    }

    function updateStatusChart() {
        const statusCounts = {
            'Not Started': 0,
            'In Progress': 0,
            'Done': 0,
            'Blocked': 0
        };

        tasks.forEach(t => {
            if (statusCounts.hasOwnProperty(t.Status)) {
                statusCounts[t.Status]++;
            }
        });

        const ctx = document.getElementById('status-chart').getContext('2d');

        if (statusChart) {
            statusChart.destroy();
        }

        statusChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: [
                        '#d1d5db', // Not Started
                        '#3b82f6', // In Progress
                        '#10b981', // Done
                        '#8b5cf6'  // Blocked
                    ],
                    borderWidth: 3,
                    borderColor: '#ffffff',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        align: 'center',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            pointStyleWidth: 16,
                            boxHeight: 10,
                            font: { family: 'Inter', size: 13, weight: '600' },
                            color: '#374151',
                            generateLabels: function(chart) {
                                const data = chart.data;
                                return data.labels.map((label, i) => ({
                                    text: `${label} (${data.datasets[0].data[i]})`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    strokeStyle: data.datasets[0].backgroundColor[i],
                                    lineWidth: 0,
                                    pointStyle: 'rectRounded',
                                    hidden: false,
                                    index: i
                                }));
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: 'Inter', size: 13, weight: '600' },
                        bodyFont: { family: 'Inter', size: 12 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        boxPadding: 6
                    }
                }
            }
        });
    }

    function updateCategoryChart() {
        const categories = [...new Set(tasks.map(t => t.Category))].filter(Boolean).sort();
        const doneByCategory = {};
        const inProgressByCategory = {};
        const remainingByCategory = {};

        categories.forEach(cat => {
            const catTasks = tasks.filter(t => t.Category === cat);
            const done = catTasks.filter(t => t.Status === 'Done').length;
            const inProg = catTasks.filter(t => t.Status === 'In Progress').length;
            doneByCategory[cat] = done;
            inProgressByCategory[cat] = inProg;
            remainingByCategory[cat] = catTasks.length - done - inProg;
        });

        // Add emoji to category labels
        const labels = categories.map(cat => {
            const config = getCategoryConfig(cat);
            return config.emoji + ' ' + cat;
        });

        const ctx = document.getElementById('category-chart').getContext('2d');

        if (categoryChart) {
            categoryChart.destroy();
        }

        categoryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Done',
                        data: categories.map(c => doneByCategory[c]),
                        backgroundColor: '#10b981',
                        borderRadius: 4
                    },
                    {
                        label: 'In Progress',
                        data: categories.map(c => inProgressByCategory[c]),
                        backgroundColor: '#3b82f6',
                        borderRadius: 4
                    },
                    {
                        label: 'Remaining',
                        data: categories.map(c => remainingByCategory[c]),
                        backgroundColor: '#e5e7eb',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            font: { family: 'Inter', size: 11, weight: '500' },
                            maxRotation: 45
                        },
                        grid: { display: false }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            font: { family: 'Inter', size: 11 }
                        },
                        grid: { color: '#f1f5f9' }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        align: 'center',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            pointStyleWidth: 16,
                            boxHeight: 10,
                            font: { family: 'Inter', size: 13, weight: '600' },
                            color: '#374151'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: 'Inter', size: 13, weight: '600' },
                        bodyFont: { family: 'Inter', size: 12 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        boxPadding: 6
                    }
                }
            }
        });
    }

    // ===== Assignee Section =====
    function updateAssigneeSection() {
        updateAssigneeCard('Maor', maorStats, maorSegmentedBar, maorProgressText);
        updateAssigneeCard('Omer', omerStats, omerSegmentedBar, omerProgressText);
    }

    function updateAssigneeCard(name, statsEl, barEl, textEl) {
        const personTasks = tasks.filter(t => t.Assignee === name);
        const total = personTasks.length;
        const done = personTasks.filter(t => t.Status === 'Done').length;
        const inProgress = personTasks.filter(t => t.Status === 'In Progress').length;
        const notStarted = personTasks.filter(t => t.Status === 'Not Started').length;
        const blocked = personTasks.filter(t => t.Status === 'Blocked').length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        statsEl.innerHTML = `
            <span class="assignee-stat"><span class="stat-dot done"></span> ${done} Done</span>
            <span class="assignee-stat"><span class="stat-dot in-progress"></span> ${inProgress} In Progress</span>
            <span class="assignee-stat"><span class="stat-dot not-started"></span> ${notStarted} Not Started</span>
            ${blocked > 0 ? `<span class="assignee-stat"><span class="stat-dot blocked"></span> ${blocked} Blocked</span>` : ''}
        `;

        // Segmented progress bar
        const donePct = total > 0 ? (done / total) * 100 : 0;
        const inProgressPct = total > 0 ? (inProgress / total) * 100 : 0;
        const blockedPct = total > 0 ? (blocked / total) * 100 : 0;

        barEl.innerHTML = `
            <div class="seg-bar seg-bar-done" style="width: ${donePct}%"></div>
            <div class="seg-bar seg-bar-in-progress" style="width: ${inProgressPct}%"></div>
            <div class="seg-bar seg-bar-blocked" style="width: ${blockedPct}%"></div>
        `;

        textEl.textContent = `${pct}% complete (${done}/${total} tasks)`;
    }

    // ===== Filters =====
    function populateCategoryFilter() {
        const categories = [...new Set(tasks.map(t => t.Category))].filter(Boolean).sort();
        filterCategory.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(cat => {
            const config = getCategoryConfig(cat);
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = config.emoji + ' ' + cat;
            filterCategory.appendChild(opt);
        });
    }

    function applyFilters() {
        const catVal = filterCategory.value;
        const assigneeVal = filterAssignee.value;
        const priorityVal = filterPriority.value;
        const statusVal = filterStatus.value;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        filteredTasks = tasks.filter(t => {
            // Standard dropdown filters
            if (catVal && t.Category !== catVal) return false;
            if (assigneeVal && t.Assignee !== assigneeVal) return false;
            if (priorityVal && t.Priority !== priorityVal) return false;
            if (statusVal && t.Status !== statusVal) return false;

            // Card-based special filters (overdue / due-soon)
            if (activeCardFilter === 'overdue') {
                if (!isTaskOverdue(t, today)) return false;
            } else if (activeCardFilter === 'due-soon') {
                if (!isTaskDueSoon(t, today)) return false;
            }

            return true;
        });

        // Sort
        filteredTasks.sort((a, b) => {
            let valA = a[sortColumn] || '';
            let valB = b[sortColumn] || '';

            // Special sort for Priority
            if (sortColumn === 'Priority') {
                const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
                valA = priorityOrder[valA] !== undefined ? priorityOrder[valA] : 3;
                valB = priorityOrder[valB] !== undefined ? priorityOrder[valB] : 3;
            }
            // Special sort for Status
            else if (sortColumn === 'Status') {
                const statusOrder = { 'Blocked': 0, 'In Progress': 1, 'Not Started': 2, 'Done': 3 };
                valA = statusOrder[valA] !== undefined ? statusOrder[valA] : 4;
                valB = statusOrder[valB] !== undefined ? statusOrder[valB] : 4;
            }
            // Date sort for ETA
            else if (sortColumn === 'ETA') {
                valA = valA ? new Date(valA).getTime() : Infinity;
                valB = valB ? new Date(valB).getTime() : Infinity;
            }
            // String sort for everything else
            else {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        renderTable();
    }

    function resetFilters() {
        filterCategory.value = '';
        filterAssignee.value = '';
        filterPriority.value = '';
        filterStatus.value = '';
        // Also clear any active card filter
        activeCardFilter = null;
        showingAll = false;
        document.querySelectorAll('.card-clickable').forEach(c => c.classList.remove('card-active'));
        applyFilters();
    }

    // ===== Sort Arrows =====
    function updateSortArrows() {
        document.querySelectorAll('.sortable').forEach(th => {
            const arrow = th.querySelector('.sort-arrow');
            th.classList.remove('active-sort');
            if (th.dataset.sort === sortColumn) {
                th.classList.add('active-sort');
                arrow.textContent = sortDirection === 'asc' ? ' ▲' : ' ▼';
            } else {
                arrow.textContent = ' ⇅';
            }
        });
    }

    // ===== Table Rendering =====
    function renderTable() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        taskTableBody.innerHTML = '';

        // Determine how many rows to display
        const totalFiltered = filteredTasks.length;
        const limit = showingAll ? totalFiltered : Math.min(displayLimit, totalFiltered);
        const visibleTasks = filteredTasks.slice(0, limit);

        visibleTasks.forEach(task => {
            const tr = document.createElement('tr');
            const isOverdue = isTaskOverdue(task, today);
            const isDueSoon = isTaskDueSoon(task, today);

            if (isOverdue) {
                tr.classList.add('overdue');
            } else if (isDueSoon) {
                tr.classList.add('due-soon');
            }

            const catConfig = getCategoryConfig(task.Category);
            const assigneeLower = (task.Assignee || '').toLowerCase();
            const priorityEmoji = getPriorityEmoji(task.Priority);

            let etaHtml = formatDate(task.ETA);
            if (isOverdue) {
                etaHtml += '<span class="overdue-tag">OVERDUE</span>';
            } else if (isDueSoon) {
                etaHtml += '<span class="due-soon-tag">SOON</span>';
            }

            tr.innerHTML = `
                <td><span class="category-pill ${catConfig.cssClass}">${catConfig.emoji} ${escapeHtml(task.Category || '')}</span></td>
                <td>${escapeHtml(task.Task || '')}</td>
                <td><span class="assignee-name"><span class="assignee-dot ${assigneeLower}"></span>${escapeHtml(task.Assignee || '')}</span></td>
                <td><span class="priority-badge ${getPriorityClass(task.Priority)}">${priorityEmoji} ${escapeHtml(task.Priority || '')}</span></td>
                <td><span class="badge ${getStatusBadgeClass(task.Status)}">${escapeHtml(task.Status || '')}</span></td>
                <td>${etaHtml}</td>
                <td>${escapeHtml(task.Notes || '')}</td>
            `;

            taskTableBody.appendChild(tr);
        });

        showingCount.textContent = limit;
        totalCount.textContent = totalFiltered;

        // Show/hide the "Show More" button
        const showMoreBtn = document.getElementById('show-more-btn');
        if (showMoreBtn) {
            if (totalFiltered > DEFAULT_DISPLAY_LIMIT) {
                showMoreBtn.classList.remove('hidden');
                if (showingAll) {
                    showMoreBtn.textContent = `▲ Show Less (top ${DEFAULT_DISPLAY_LIMIT})`;
                } else {
                    const remaining = totalFiltered - limit;
                    showMoreBtn.textContent = `▼ Show All ${totalFiltered} Tasks (+${remaining} more)`;
                }
            } else {
                showMoreBtn.classList.add('hidden');
            }
        }
    }

    function toggleShowMore() {
        showingAll = !showingAll;
        renderTable();
    }

    // ===== Helpers =====
    function getOverdueTasks() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return tasks.filter(t => isTaskOverdue(t, today));
    }

    function getDueSoonTasks() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return tasks.filter(t => isTaskDueSoon(t, today));
    }

    function isTaskOverdue(task, today) {
        if (task.Status === 'Done') return false;
        if (!task.ETA) return false;
        const eta = new Date(task.ETA);
        eta.setHours(0, 0, 0, 0);
        return eta < today;
    }

    function isTaskDueSoon(task, today) {
        if (task.Status === 'Done') return false;
        if (!task.ETA) return false;
        const eta = new Date(task.ETA);
        eta.setHours(0, 0, 0, 0);
        if (eta < today) return false; // overdue, not "due soon"
        const weekFromNow = new Date(today);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        return eta <= weekFromNow;
    }

    function getCategoryConfig(category) {
        if (!category) return { emoji: '📌', cssClass: 'cat-default' };
        // Try exact match first
        if (CATEGORY_CONFIG[category]) return CATEGORY_CONFIG[category];
        // Try partial match
        const lower = category.toLowerCase();
        for (const [key, val] of Object.entries(CATEGORY_CONFIG)) {
            if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
                return val;
            }
        }
        return { emoji: '📌', cssClass: 'cat-default' };
    }

    function getStatusBadgeClass(status) {
        switch (status) {
            case 'Not Started': return 'badge-not-started';
            case 'In Progress': return 'badge-in-progress';
            case 'Done': return 'badge-done';
            case 'Blocked': return 'badge-blocked';
            default: return '';
        }
    }

    function getPriorityClass(priority) {
        switch (priority) {
            case 'High': return 'priority-high';
            case 'Medium': return 'priority-medium';
            case 'Low': return 'priority-low';
            default: return '';
        }
    }

    function getPriorityEmoji(priority) {
        switch (priority) {
            case 'High': return '🔴';
            case 'Medium': return '🟡';
            case 'Low': return '⚪';
            default: return '';
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return escapeHtml(dateStr);
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return escapeHtml(dateStr);
        }
    }

    function formatDateTime(isoStr) {
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return isoStr;
        }
    }

    function updateLastLoaded() {
        lastLoaded.textContent = formatDateTime(new Date().toISOString());
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== Start =====
    init();
})();
