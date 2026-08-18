        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { initializeFirestore, persistentLocalCache, doc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // 本地模組的 import 必須帶 ?v= 版號:service worker 的 network-first 用的
        // fetch() 仍會吃瀏覽器 HTTP 快取,URL 不變就抓不到新檔,會出現
        // 「新 app.js 配舊模組」的 does not provide an export named ... 錯誤。
        // 版號要跟 index.html 的 app.js?v= 一起改(見 CLAUDE.md 的 commit 檢查清單)。
        import { pickPriorityNutrient } from './recommend.js?v=0.7.8';
        import { mealTime, mealTypeForTime, snapTime, buildTimeline, DEFAULT_MEAL_TIME } from './timeline.js?v=0.7.8';
        import { topMealRanking, paginate, monthsInRange } from './stats.js?v=0.7.8';

        const { createApp, ref, reactive, computed, onMounted, watch } = Vue;

        if ('serviceWorker' in navigator) {
            let reloadOnControllerChange = false;
            // 新版接手後自動重新載入一次(僅在偵測到更新時,首次安裝不觸發)
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (reloadOnControllerChange) {
                    reloadOnControllerChange = false;
                    window.location.reload();
                }
            });

            const promote = (worker) => {
                if (!worker) return;
                reloadOnControllerChange = true;
                worker.postMessage({ type: 'SKIP_WAITING' });
            };

            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js')
                    .then(registration => {
                        console.log('Service Worker registered with scope:', registration.scope);
                        // 進站時已有等待中的新版(先前卡住的情況)→ 立即接手
                        if (registration.waiting && navigator.serviceWorker.controller) {
                            promote(registration.waiting);
                        }
                        // 之後偵測到新版:安裝完成且已有舊版控制 = 更新,標記為需重載
                        registration.addEventListener('updatefound', () => {
                            const nw = registration.installing;
                            if (!nw) return;
                            nw.addEventListener('statechange', () => {
                                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                                    promote(nw);
                                }
                            });
                        });
                    })
                    .catch(error => {
                        console.error('Service Worker registration failed:', error);
                    });
            });
        }


        createApp({
            setup() {
                console.log('App initialization starting... v0.7.8');
                // 統一日期格式化工具 (確保 YYYY-MM-DD)
                const formatDate = (d) => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                };

                const isDark = ref(localStorage.getItem('theme') === 'dark');
                const updateTheme = () => {
                    if (isDark.value) {
                        document.documentElement.classList.add('dark');
                    } else {
                        document.documentElement.classList.remove('dark');
                    }
                };
                const toggleTheme = () => {
                    isDark.value = !isDark.value;
                    localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
                    updateTheme();
                };

                const initialized = ref(false);
                const user = ref(null);
                const saving = ref(false);
                const showSettings = ref(false);
                const showHistory = ref(false);
                const showExportModal = ref(false);
                const isExporting = ref(false);
                const exportRange = reactive({ start: formatDate(new Date(new Date().setDate(new Date().getDate() - 7))), end: formatDate(new Date()) });
                const excludedDates = ref(new Set());

                const exportDateList = computed(() => {
                    const list = [];
                    const start = new Date(exportRange.start);
                    const end = new Date(exportRange.end);
                    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
                    const temp = new Date(start);
                    while (temp <= end) {
                        list.push(formatDate(new Date(temp)));
                        temp.setDate(temp.getDate() + 1);
                    }
                    return list;
                });

                const toggleExcludedDate = (date) => {
                    if (excludedDates.value.has(date)) excludedDates.value.delete(date);
                    else excludedDates.value.add(date);
                };

                const toggleAllExportDates = (select) => {
                    if (select) excludedDates.value.clear();
                    else exportDateList.value.forEach(d => excludedDates.value.add(d));
                };

                const setQuickRange = (type) => {
                    const now = new Date();
                    let start, end = new Date(now);
                    if (type === 'thisWeek') {
                        const day = now.getDay();
                        const diff = (day === 0 ? -6 : 1) - day;
                        start = new Date(now.getTime() + diff * 86400000);
                        end = new Date();
                    } else if (type === 'lastWeek') {
                        const day = now.getDay();
                        const diff = (day === 0 ? -6 : 1) - day - 7;
                        start = new Date(now.getTime() + diff * 86400000);
                        end = new Date(start.getTime() + 6 * 86400000);
                    } else if (type === 'thisMonth') {
                        start = new Date(now.getFullYear(), now.getMonth(), 1);
                        end = new Date();
                    } else if (type === 'lastMonth') {
                        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        end = new Date(now.getFullYear(), now.getMonth(), 0);
                    } else if (type === 'thisYear') {
                        start = new Date(now.getFullYear(), 0, 1);
                        end = new Date();
                    }
                    if (start && end) {
                        exportRange.start = formatDate(start);
                        exportRange.end = formatDate(end);
                    }
                };

                const showMonthPicker = ref(false);
                const historySearch = ref('');
                const historySortBy = ref('count'); // count, calories, carbs, protein, fat
                const historySortOrder = ref('desc'); // desc, asc
                const historyTab = ref('general'); // general, combo
                const quickNutrientInput = ref('');

                // 通用營養素解析工具
                const parseNutrients = (target, inputStr) => {
                    if (!inputStr) return;
                    // 移除 . 從分隔符號中，以支援小數點
                    const parts = inputStr.split(/[\/\s,，。]+/).filter(p => p !== '');
                    if (parts.length >= 1) target.calories = formatFloat(parts[0]);
                    if (parts.length >= 2) target.carbs = formatFloat(parts[1]);
                    if (parts.length >= 3) target.protein = formatFloat(parts[2]);
                    if (parts.length >= 4) target.fat = formatFloat(parts[3]);
                };

                const parseQuickInput = () => {
                    parseNutrients(editingMeal, quickNutrientInput.value);
                    if (quickNutrientInput.value) quickNutrientInput.value = '';
                };

                const parseItemInput = (item) => {
                    parseNutrients(item, item.qInput);
                    updateTotalsFromItems();
                };

                // 報告資料快照:模板改讀這份而非每次呼叫 getRangeStats()
                // (報告區塊常駐 DOM,原本任何反應式變動都會重算 11 次、每次掃整個日期區間)
                const exportStats = ref(null);
                const dayTimeline = (day) => buildTimeline(day.meals, day.workouts);

                // 資料是分月按需載入的(loadMonthData / loadedMonths),使用者沒瀏覽過的月份
                // 不在 allData 裡。匯出前必須把區間跨到的每個月補齊,否則報告會整份空白。
                const ensureRangeLoaded = () => Promise.all(
                    monthsInRange(exportRange.start, exportRange.end).map(ym =>
                        loadMonthData(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)))
                );

                const exportPDF = async () => {
                    isExporting.value = true;
                    await ensureRangeLoaded();
                    exportStats.value = getRangeStats(); // 先算好快照,報告才會用同一份資料渲染
                    await Vue.nextTick();

                    const reportEl = document.getElementById('export-report');
                    if (!reportEl) {
                        isExporting.value = false;
                        exportStats.value = null;
                        return;
                    }
                    reportEl.style.display = 'block';
                    renderExportCharts(exportStats.value);

                    // 圖表已關閉動畫,只需等字體與 layout 穩定
                    await new Promise(r => setTimeout(r, 400));

                    try {
                        const { jsPDF } = window.jspdf;
                        const canvas = await html2canvas(reportEl, {
                            scale: 2,
                            useCORS: true,
                            backgroundColor: '#f8f9fb',
                            logging: false
                        });

                        const pdf = new jsPDF('p', 'mm', 'a4');
                        const pageW = pdf.internal.pageSize.getWidth();
                        const pageH = pdf.internal.pageSize.getHeight();
                        const pxPerMm = canvas.width / pageW;

                        // 換頁只切在 [data-break] 區塊的邊界上,不再固定每 pageH 硬切穿內容。
                        // reportEl 此時仍是 display:block,量得到版面座標。
                        const ratio = canvas.width / reportEl.offsetWidth;
                        const baseTop = reportEl.getBoundingClientRect().top;
                        const cuts = [...reportEl.querySelectorAll('[data-break]')]
                            .map(el => Math.round((el.getBoundingClientRect().top - baseTop) * ratio));

                        // 每頁裁一張,而不是把整張長圖用負位移疊在每一頁上
                        const slice = document.createElement('canvas');
                        const sctx = slice.getContext('2d');
                        slice.width = canvas.width;
                        // 全部取整,切片高度才不會有次像素誤差
                        paginate(canvas.height, Math.floor(pageH * pxPerMm), cuts).forEach((p, i) => {
                            const h = p.end - p.start;
                            slice.height = h;
                            sctx.fillStyle = '#f8f9fb';
                            sctx.fillRect(0, 0, slice.width, h);
                            sctx.drawImage(canvas, 0, p.start, canvas.width, h, 0, 0, canvas.width, h);
                            if (i > 0) pdf.addPage();
                            pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, pageW, h / pxPerMm);
                        });
                        pdf.save(`健康報告_${exportRange.start}_to_${exportRange.end}.pdf`);

                        showExportModal.value = false;
                    } catch (e) {
                        console.error('匯出 PDF 失敗', e);
                        alert('匯出失敗，請稍後再試');
                    } finally {
                        reportEl.style.display = 'none';
                        exportStats.value = null;
                        isExporting.value = false;
                    }
                };

                const getRangeStats = () => {
                    const stats = {
                        days: 0,
                        recordedDays: 0,
                        totalCalories: 0,
                        avgCalories: 0,
                        avgCarbs: 0,
                        avgProtein: 0,
                        avgFat: 0,
                        totalCarbs: 0,
                        totalProtein: 0,
                        totalFat: 0,
                        dailyLabels: [],
                        dailyCals: [],
                        dailyMacroCals: { carbs: [], protein: [], fat: [] },
                        meals: [],
                        dailyRecords: [],
                        daysByType: { high: 0, med: 0, low: 0, rest: 0 },
                        typeAverages: {}, // 各碳日實際平均攝取
                        topMeals: [],
                        nutrientPercents: { carbs: 0, protein: 0, fat: 0 }
                    };
                    const start = new Date(exportRange.start);
                    const end = new Date(exportRange.end);
                    // 各碳日累計:只算有紀錄餐點的日子,否則空白日會把平均拉低
                    const typeAcc = {};

                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        const dateStr = formatDate(d);
                        if (excludedDates.value.has(dateStr)) continue; // 使用者在匯出清單取消勾選的日期
                        const record = allData[dateStr];
                        stats.days++;
                        stats.dailyLabels.push(dateStr.slice(5));

                        let dayType = 'med';
                        if (record && record.planType) {
                            dayType = record.planType;
                            stats.daysByType[record.planType]++;
                        }

                        let dayCal = 0, dayCarbs = 0, dayProtein = 0, dayFat = 0;
                        const dayMeals = record && record.meals ? record.meals : [];
                        dayMeals.forEach(m => {
                            dayCal += Number(m.calories) || 0;
                            dayCarbs += Number(m.carbs) || 0;
                            dayProtein += Number(m.protein) || 0;
                            dayFat += Number(m.fat) || 0;
                            stats.meals.push({ date: dateStr, ...m });
                        });
                        stats.totalCalories += dayCal;
                        stats.totalCarbs += dayCarbs;
                        stats.totalProtein += dayProtein;
                        stats.totalFat += dayFat;

                        if (dayMeals.length > 0) {
                            stats.recordedDays++;
                            const acc = typeAcc[dayType] || (typeAcc[dayType] = { days: 0, calories: 0, carbs: 0, protein: 0, fat: 0 });
                            acc.days++;
                            acc.calories += dayCal;
                            acc.carbs += dayCarbs;
                            acc.protein += dayProtein;
                            acc.fat += dayFat;
                        }

                        stats.dailyCals.push(dayCal);
                        stats.dailyMacroCals.carbs.push(Math.round(dayCarbs * 4));
                        stats.dailyMacroCals.protein.push(Math.round(dayProtein * 4));
                        stats.dailyMacroCals.fat.push(Math.round(dayFat * 9));
                        stats.dailyRecords.push({
                            date: dateStr,
                            meals: dayMeals,
                            workouts: (record && record.workouts) || [],
                            totalCalories: dayCal,
                            planType: dayType
                        });
                    }

                    const avgOver = stats.recordedDays || 1;
                    stats.avgCalories = Math.round(stats.totalCalories / avgOver);
                    stats.avgCarbs = Math.round(stats.totalCarbs / avgOver);
                    stats.avgProtein = Math.round(stats.totalProtein / avgOver);
                    stats.avgFat = Math.round(stats.totalFat / avgOver);

                    Object.entries(typeAcc).forEach(([type, a]) => {
                        stats.typeAverages[type] = {
                            days: a.days,
                            calories: Math.round(a.calories / a.days),
                            carbs: Math.round(a.carbs / a.days),
                            protein: Math.round(a.protein / a.days),
                            fat: Math.round(a.fat / a.days)
                        };
                    });

                    stats.topMeals = topMealRanking(stats.meals);

                    const cCal = stats.totalCarbs * 4;
                    const pCal = stats.totalProtein * 4;
                    const fCal = stats.totalFat * 9;
                    const totalNutrientCal = cCal + pCal + fCal || 1;
                    stats.nutrientPercents = {
                        carbs: Math.round(cCal / totalNutrientCal * 100),
                        protein: Math.round(pCal / totalNutrientCal * 100),
                        fat: Math.round(fCal / totalNutrientCal * 100)
                    };

                    return stats;
                };

                let nutrientChart = null;
                let trendChart = null;
                const renderExportCharts = (stats) => {
                    if (nutrientChart) nutrientChart.destroy();
                    if (trendChart) trendChart.destroy();
                    const ctx1 = document.getElementById('nutrientChart').getContext('2d');
                    nutrientChart = new Chart(ctx1, {
                        type: 'doughnut',
                        data: { labels: ['淨碳水', '蛋白', '脂肪'], datasets: [{ data: [stats.totalCarbs, stats.totalProtein, stats.totalFat], backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899'], borderWidth: 0 }] },
                        options: { responsive: false, animation: false, plugins: { legend: { position: 'bottom', labels: { font: { weight: 'bold' } } } } }
                    });
                    // 橫向堆疊柱狀圖:柱長 = 當日總熱量,分段顏色 = 三大營養素各自貢獻的熱量
                    // 寬度固定,日期多只會往下長(canvas 高度由模板依天數綁定),不會撐爆版面
                    const ctx2 = document.getElementById('trendChart').getContext('2d');
                    trendChart = new Chart(ctx2, {
                        type: 'bar',
                        data: {
                            labels: stats.dailyLabels,
                            datasets: [
                                { label: '淨碳水', data: stats.dailyMacroCals.carbs, backgroundColor: '#6366f1' },
                                { label: '蛋白', data: stats.dailyMacroCals.protein, backgroundColor: '#8b5cf6' },
                                { label: '脂肪', data: stats.dailyMacroCals.fat, backgroundColor: '#ec4899' }
                            ]
                        },
                        options: {
                            indexAxis: 'y',
                            responsive: false,
                            animation: false,
                            scales: {
                                x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 } } },
                                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 9, weight: 'bold' }, autoSkip: false } }
                            },
                            plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10, weight: 'bold' } } } }
                        }
                    });
                };

                const selectedDate = ref(formatDate(new Date()));
                const pickerMonth = ref(new Date()); // 用於月份選擇器的顯示月份
                const loginEmail = ref('');
                const loginPassword = ref('');

                const screenWidth = ref(window.innerWidth);
                window.addEventListener('resize', () => {
                    screenWidth.value = window.innerWidth;
                });
                const isMobile = computed(() => screenWidth.value < 1024);

                const isCalendarExpanded = ref(window.innerWidth >= 1024);
                const showCalendarModal = ref(false);
                const isNameAuto = ref(true);
                const showMonthModal = ref(false);
                const jumpYear = ref(new Date().getFullYear());
                const showMonthJump = ref(false); // 確保沒遺漏，雖然現在改用 modal
                const showMobileMenu = ref(false);

                const toggleCalendar = (val) => {
                    if (isMobile.value) {
                        showCalendarModal.value = (val !== undefined) ? val : !showCalendarModal.value;
                    } else {
                        if (val !== undefined) isCalendarExpanded.value = val;
                        else isCalendarExpanded.value = !isCalendarExpanded.value;
                    }
                };

                const jumpToMonth = async (mIdx) => {
                    const newMonth = new Date(jumpYear.value, mIdx, 1);
                    pickerMonth.value = newMonth;
                    // 同步更新選中日期到該月 1 號
                    selectedDate.value = formatDate(newMonth);
                    showMonthModal.value = false;
                    await loadMonthData(newMonth);
                };

                const editingIndex = ref(null);
                const isAddingMeal = ref(false);
                const skipHistorySave = ref(false);
                const appVersion = ref('0.7.8');
                const editingMeal = reactive({ type: 'lunch', time: '12:00', name: '', amount: 1, unit: '份', calories: 0, carbs: 0, protein: 0, fat: 0, items: [] });
                const tempMealBackup = ref(null);

                const updateTotalsFromItems = () => {
                    if (!editingMeal.items || editingMeal.items.length === 0) return;
                    // 品項四格為該品項總量,直接相加即可(份數變動由 changeItemAmount 依比例縮放)
                    const sumBy = (key) => editingMeal.items.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
                    editingMeal.calories = formatFloat(sumBy('calories'));
                    editingMeal.carbs = formatFloat(sumBy('carbs'));
                    editingMeal.protein = formatFloat(sumBy('protein'));
                    editingMeal.fat = formatFloat(sumBy('fat'));
                    
                    // 自動生成名稱：只要 isNameAuto 為 true，就持續同步
                    if (isNameAuto.value) {
                        const names = editingMeal.items.map(i => i.name).filter(n => n).join(' + ');
                        if (names) {
                            editingMeal.name = names;
                        }
                    }
                };

                const activeSuggestItem = ref(null); // 目前展開自動完成的組合品項 index
                const SUGGEST_PAGE_SIZE = 6;
                const itemSuggestPage = ref(0); // 自動完成下拉目前頁碼(0-based)
                // 相符的一般品項(排除組合餐),依套用次數由高到低排序;不分頁,分頁交給下方 helper
                const itemSuggestions = (term) => {
                    const q = (term || '').toLowerCase().trim();
                    if (!q) return [];
                    return Object.values(templates)
                        .filter(t => t && t.name && (!t.items || t.items.length === 0))
                        .filter(t => t.name.toLowerCase().includes(q))
                        .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
                };
                const suggestPageCount = (term) => Math.max(1, Math.ceil(itemSuggestions(term).length / SUGGEST_PAGE_SIZE));
                const pagedSuggestions = (term) => {
                    const start = itemSuggestPage.value * SUGGEST_PAGE_SIZE;
                    return itemSuggestions(term).slice(start, start + SUGGEST_PAGE_SIZE);
                };
                const applyItemSuggestion = (item, template) => {
                    item.name = template.name;
                    item.unit = template.unit || '份';
                    item.amount = 1;
                    item.calories = Number(template.calories) || 0;
                    item.carbs = Number(template.carbs) || 0;
                    item.protein = Number(template.protein) || 0;
                    item.fat = Number(template.fat) || 0;
                    item._amt = 1; // 記錄目前份數,供之後份數變動按比例縮放
                    activeSuggestItem.value = null;
                    updateTotalsFromItems();
                };

                const addItem = () => {
                    if (!editingMeal.items) editingMeal.items = [];
                    // 變成組合餐點的那一刻預設不存入資料庫(組合多半是當餐一次性的),要存需自行取消勾選
                    if (editingMeal.items.length === 0) skipHistorySave.value = true;
                    editingMeal.items.unshift({ name: '', amount: 1, unit: '份', calories: 0, carbs: 0, protein: 0, fat: 0, qInput: '', _amt: 1 });
                };

                // 名稱、份量、熱量都填完,且資料庫裡還沒有這筆時,才給存入按鈕
                const canSaveItemToHistory = (item) => !!(item.name || '').trim()
                    && Number(item.amount) > 0
                    && Number(item.calories) > 0
                    && !templates[(item.name || '').toLowerCase().trim()];

                // 組合品項在資料庫裡找不到時,一鍵當成一般餐點存入(四格為該品項總量,先還原成單份)
                const saveItemToHistory = (item) => {
                    const k = (item.name || '').toLowerCase().trim();
                    if (!k) return;
                    const a = Number(item.amount) > 0 ? Number(item.amount) : 1;
                    templates[k] = {
                        name: item.name.trim(),
                        amount: 1,
                        unit: item.unit || '份',
                        calories: formatFloat((Number(item.calories) || 0) / a),
                        carbs: formatFloat((Number(item.carbs) || 0) / a),
                        protein: formatFloat((Number(item.protein) || 0) / a),
                        fat: formatFloat((Number(item.fat) || 0) / a),
                        count: templates[k]?.count || 0
                    };
                    saveData();
                };

                const removeItem = (idx) => {
                    editingMeal.items.splice(idx, 1);
                    // 品項清空 = 退回一般餐點,連同上面的預設一起還原
                    if (editingMeal.items.length === 0) skipHistorySave.value = false;
                    updateTotalsFromItems();
                };

                // 份數變動時,依比例縮放該品項的四格營養值(四格為該品項總量)
                const beginItemAmount = (item) => { item._amt = Number(item.amount) || 0; };
                const changeItemAmount = (item) => {
                    const oldA = Number(item._amt);
                    const newA = Number(item.amount);
                    if (oldA > 0 && newA > 0 && oldA !== newA) {
                        const f = newA / oldA;
                        item.calories = formatFloat((Number(item.calories) || 0) * f);
                        item.carbs = formatFloat((Number(item.carbs) || 0) * f);
                        item.protein = formatFloat((Number(item.protein) || 0) * f);
                        item.fat = formatFloat((Number(item.fat) || 0) * f);
                    }
                    if (newA > 0) item._amt = newA;
                    updateTotalsFromItems();
                };
                const mealToDelete = ref(null);
                const historyToDelete = ref(null);

                // === 長按拖曳調整時間 ===
                // 垂直位移換算時間,15 分鐘一格。DRAG_PX_PER_STEP 是手感校準值,拖起來太快/太慢就調這個
                const DRAG_PX_PER_STEP = 24;
                const dragRow = ref(null);         // { kind, originalIndex, startTime, time }
                const dragPos = ref({ x: 0, y: 0 });
                let pressTimer = null, pressStart = null;

                const resetPress = () => { clearTimeout(pressTimer); pressStart = null; };

                const onRowPointerDown = (e, row) => {
                    if (e.target.closest('button, input, textarea')) return;
                    pressStart = { x: e.clientX, y: e.clientY };
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    clearTimeout(pressTimer);
                    pressTimer = setTimeout(() => {
                        dragRow.value = {
                            kind: row.kind,
                            originalIndex: row.originalIndex,
                            startTime: row.time,
                            time: row.time
                        };
                        dragPos.value = { ...pressStart };
                        navigator.vibrate?.(30);
                    }, 400);
                };

                const onRowPointerMove = (e) => {
                    if (!dragRow.value) {
                        if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) resetPress();
                        return;
                    }
                    dragPos.value = { x: e.clientX, y: e.clientY };
                    const dy = e.clientY - pressStart.y;
                    dragRow.value.time = snapTime(dragRow.value.startTime, Math.round(dy / DRAG_PX_PER_STEP) * 15);
                };

                // 拖曳中阻止頁面滾動（touch-action 無法在手勢中途生效，只能 preventDefault）
                const onRowTouchMove = (e) => { if (dragRow.value) e.preventDefault(); };

                const onRowPointerUp = () => {
                    resetPress();
                    const drag = dragRow.value;
                    dragRow.value = null;
                    if (!drag || drag.time === drag.startTime) return;
                    const day = allData[selectedDate.value];
                    const target = drag.kind === 'meal' ? day?.meals?.[drag.originalIndex] : day?.workouts?.[drag.originalIndex];
                    if (!target) return;
                    target.time = drag.time;
                    if (drag.kind === 'meal') sortMeals();
                    saveData();
                };

                const cancelRowDrag = () => { resetPress(); dragRow.value = null; };
                const showSyncModal = ref(false);
                const lastAmount = ref(1);
                const originalNutrients = reactive({ calories: 0, carbs: 0, protein: 0, fat: 0 });
                const templates = reactive({});

                const nutrientKeys = [{ key: 'carbs', label: '淨碳水' }, { key: 'protein', label: '蛋白質' }, { key: 'fat', label: '脂肪' }];

                const profile = reactive({
                    gender: 'male', weight: 70, height: 175, age: 30, activity: 1.2, goal: 'lose'
                });

                const plans = reactive({
                    high: { calories: { min: 2100, max: 2300 }, carbs: { min: 260, max: 280 }, protein: { min: 160, max: 170 }, fat: { min: 45, max: 55 } },
                    med: { calories: { min: 1700, max: 1900 }, carbs: { min: 170, max: 190 }, protein: { min: 130, max: 140 }, fat: { min: 55, max: 65 } },
                    low: { calories: { min: 1400, max: 1600 }, carbs: { min: 60, max: 80 }, protein: { min: 140, max: 160 }, fat: { min: 60, max: 70 } },
                    rest: { calories: { min: 1300, max: 1500 }, carbs: { min: 20, max: 50 }, protein: { min: 130, max: 150 }, fat: { min: 70, max: 85 } }
                });

                const tempPlans = reactive({
                    high: { calories: { min: 0, max: 0 }, carbs: { min: 0, max: 0 }, protein: { min: 0, max: 0 }, fat: { min: 0, max: 0 } },
                    med: { calories: { min: 0, max: 0 }, carbs: { min: 0, max: 0 }, protein: { min: 0, max: 0 }, fat: { min: 0, max: 0 } },
                    low: { calories: { min: 0, max: 0 }, carbs: { min: 0, max: 0 }, protein: { min: 0, max: 0 }, fat: { min: 0, max: 0 } },
                    rest: { calories: { min: 0, max: 0 }, carbs: { min: 0, max: 0 }, protein: { min: 0, max: 0 }, fat: { min: 0, max: 0 } }
                });

                const allData = reactive({});
                let db, auth, unsubscribe = null;
                const appId = typeof __app_id !== 'undefined' ? __app_id : 'diet-tracker-v2';


                // 數值格式化：四捨五入至整數
                const formatNum = (val) => {
                    if (val === undefined || val === null || isNaN(val)) return 0;
                    return Math.round(Number(val));
                };

                const formatFloat = (val) => {
                    if (val === undefined || val === null || isNaN(val)) return 0;
                    return Number(Number(val).toFixed(2));
                };

                const scaleNutrients = () => {
                    const newAmount = editingMeal.amount || 0;
                    if (lastAmount.value > 0 && newAmount >= 0) {
                        const ratio = newAmount / lastAmount.value;
                        editingMeal.calories = formatFloat(originalNutrients.calories * ratio);
                        editingMeal.carbs = formatFloat(originalNutrients.carbs * ratio);
                        editingMeal.protein = formatFloat(originalNutrients.protein * ratio);
                        editingMeal.fat = formatFloat(originalNutrients.fat * ratio);
                    }
                };

                const prepareScale = () => {
                    lastAmount.value = editingMeal.amount || 1;
                    originalNutrients.calories = editingMeal.calories;
                    originalNutrients.carbs = editingMeal.carbs;
                    originalNutrients.protein = editingMeal.protein;
                    originalNutrients.fat = editingMeal.fat;
                };

                const calculatedTDEE = computed(() => {
                    const { gender, weight, height, age, activity } = profile;
                    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
                    bmr = gender === 'male' ? bmr + 5 : bmr - 161;
                    return Math.round(bmr * activity);
                });

                // 目標缺口/中點(本地版,供推薦排序與 return 物件的 getGap/getGoalMidpoint 共用)
                const goalMidpoint = (type) => {
                    const day = allData[selectedDate.value];
                    const plan = activePlan(selectedDate.value, day);
                    const goal = plan[type];
                    if (typeof goal === 'object' && goal !== null) return Math.round((goal.min + goal.max) / 2);
                    return goal || 1;
                };
                const goalGap = (type) => {
                    const day = allData[selectedDate.value];
                    const plan = activePlan(selectedDate.value, day);
                    const goal = plan[type];
                    const sum = (allData[selectedDate.value]?.meals || []).reduce((s, m) => s + (Number(m[type]) || 0), 0);
                    if (typeof goal === 'object' && goal !== null) {
                        const mid = Math.round((goal.min + goal.max) / 2);
                        if (sum < goal.min) return mid - sum;
                        if (sum > goal.max) return Math.round(goal.max - sum);
                        return Math.round(goal.max - sum);
                    }
                    return Math.round((goal || 0) - sum);
                };
                const priorityNutrient = computed(() => pickPriorityNutrient({
                    carbs:   { gap: goalGap('carbs'),   mid: goalMidpoint('carbs')   },
                    protein: { gap: goalGap('protein'), mid: goalMidpoint('protein') },
                    fat:     { gap: goalGap('fat'),     mid: goalMidpoint('fat')     },
                }));
                const priorityNutrientLabel = computed(() => {
                    const k = priorityNutrient.value;
                    if (!k) return '三大營養素皆達標,依常用度排序';
                    const map = { carbs: '淨碳水', protein: '蛋白質', fat: '脂肪' };
                    return '目前推薦補:' + map[k];
                });

                // 計算歷史紀錄 (食物資料庫)
                const historyDisplayLimit = ref(20);
                const mealHistory = computed(() => {
                    // 使用 Object.values 獲取所有模板，並確保響應性
                    let list = Object.values(templates)
                        .filter(t => t && t.name)
                        .map(t => ({
                            ...t,
                            count: Number(t.count) || 0,
                            calories: Number(t.calories) || 0,
                            carbs: Number(t.carbs) || 0,
                            protein: Number(t.protein) || 0,
                            fat: Number(t.fat) || 0
                        }));

                    // 1. 分類過濾：組合餐點 vs 一般餐點
                    if (historyTab.value === 'combo') {
                        list = list.filter(m => m.items && m.items.length > 0);
                    } else {
                        list = list.filter(m => !m.items || m.items.length === 0);
                    }

                    // 2. 關鍵字過濾
                    if (historySearch.value) {
                        const term = historySearch.value.toLowerCase().trim();
                        list = list.filter(m => m.name.toLowerCase().includes(term));
                    }

                    // 3. 排序邏輯
                    const sortBy = historySortBy.value;
                    const sortOrder = historySortOrder.value;

                    // 統一排序基準：g 單位的餐點換算為 per-100g 再比較
                    const sortScale = (item) => item.unit === 'g' ? 100 : 1;

                    // 推薦排序:取當日最該補的營養素;皆達標時 recKey 為 null → 退回次數排序
                    const recKey = sortBy === 'recommend' ? priorityNutrient.value : null;

                    list.sort((a, b) => {
                        let valA, valB;
                        if (sortBy === 'count' || (sortBy === 'recommend' && !recKey)) {
                            valA = a.count;
                            valB = b.count;
                        } else {
                            const key = sortBy === 'recommend' ? recKey : sortBy;
                            valA = (a[key] || 0) * sortScale(a);
                            valB = (b[key] || 0) * sortScale(b);
                        }

                        if (sortOrder === 'desc') {
                            return valB - valA;
                        } else {
                            return valA - valB;
                        }
                    });

                    return list;
                });

                const visibleMealHistory = computed(() => {
                    return mealHistory.value.slice(0, historyDisplayLimit.value);
                });

                watch([historySearch, historySortBy, historySortOrder, historyTab], () => {
                    historyDisplayLimit.value = 20; // 變更條件時重置顯示數量
                });

                const handleHistoryScroll = (e) => {
                    const el = e.target;
                    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 100) {
                        if (historyDisplayLimit.value < mealHistory.value.length) {
                            historyDisplayLimit.value += 20;
                        }
                    }
                };

                const historyPickMode = ref(null); // null=加到當日;數字=填回組合品項 index
                const historyMealType = ref('lunch'); // 從資料庫加到當日時要放入的餐別
                const pendingHistoryMeal = ref(null); // 待選餐別的資料庫餐點(點擊後跳出選擇面板)
                const pendingAmount = ref(1); // 選餐別面板中可調整的份量,加入時按比例縮放營養素
                const pendingType = ref('lunch'); // 面板中選中的餐別
                const pendingTime = ref('12:00'); // 面板中的時間,預設隨餐別變動

                const pendingTimeIsSuggestion = ref(true); // 同 mealTimeIsSuggestion:手動調過就不再被餐別覆蓋

                const pickPendingType = (key) => {
                    pendingType.value = key;
                    if (pendingTimeIsSuggestion.value) pendingTime.value = DEFAULT_MEAL_TIME[key];
                };
                const openHistory = (pickIdx = null) => {
                    historyPickMode.value = pickIdx;
                    historyMealType.value = 'lunch';
                    pendingHistoryMeal.value = null;
                    historySortBy.value = 'recommend';
                    historySortOrder.value = 'desc'; // 推薦排序需由高到低,避免沿用上次的 asc
                    if (pickIdx !== null) historyTab.value = 'general'; // 挑入組合品項時只列一般餐點
                    showHistory.value = true;
                };
                const closeHistory = () => {
                    historyPickMode.value = null;
                    pendingHistoryMeal.value = null;
                    showHistory.value = false;
                };

                // 點擊資料庫餐點:挑入組合品項/編輯替換維持立即行為;加到當日則先跳出選餐別面板
                const chooseHistoryMeal = (meal) => {
                    if (historyPickMode.value !== null || editingIndex.value !== null) {
                        addFromHistory(meal);
                        return;
                    }
                    pendingHistoryMeal.value = meal;
                    pendingAmount.value = Number(meal.amount) > 0 ? Number(meal.amount) : 1;
                    // 預設依當下時間推導餐別,使用者可再改
                    pendingTime.value = nowHHMM();
                    pendingType.value = mealTypeForTime(pendingTime.value);
                    pendingTimeIsSuggestion.value = true;
                };

                // 面板中調整份量:以資料庫原始份量為基準等比縮放營養素
                const pendingAmountValid = computed(() => {
                    const a = Number(pendingAmount.value);
                    return Number.isFinite(a) && a > 0;
                });
                const pendingScaled = computed(() => {
                    const m = pendingHistoryMeal.value;
                    if (!m) return null;
                    const base = Number(m.amount) > 0 ? Number(m.amount) : 1;
                    const ratio = pendingAmountValid.value ? Number(pendingAmount.value) / base : 0;
                    return {
                        calories: formatFloat((Number(m.calories) || 0) * ratio),
                        carbs: formatFloat((Number(m.carbs) || 0) * ratio),
                        protein: formatFloat((Number(m.protein) || 0) * ratio),
                        fat: formatFloat((Number(m.fat) || 0) * ratio)
                    };
                });
                const confirmHistoryAdd = () => {
                    if (!pendingHistoryMeal.value || !pendingAmountValid.value || !pendingTime.value) return;
                    historyMealType.value = pendingType.value;
                    addFromHistory(Object.assign(
                        JSON.parse(JSON.stringify(pendingHistoryMeal.value)),
                        { amount: Number(pendingAmount.value), time: pendingTime.value },
                        pendingScaled.value
                    ));
                    pendingHistoryMeal.value = null;
                };
                const addFromHistory = (meal) => {
                    if (historyPickMode.value !== null) {
                        const item = editingMeal.items[historyPickMode.value];
                        if (item) {
                            item.name = meal.name;
                            item.unit = meal.unit || '份';
                            item.amount = 1;
                            item.calories = Number(meal.calories) || 0;
                            item.carbs = Number(meal.carbs) || 0;
                            item.protein = Number(meal.protein) || 0;
                            item.fat = Number(meal.fat) || 0;
                            item._amt = 1; // 記錄目前份數,供之後份數變動按比例縮放
                            updateTotalsFromItems();
                        }
                        historyPickMode.value = null;
                        showHistory.value = false;
                        return;
                    }
                    const newMeal = JSON.parse(JSON.stringify(meal));
                    if (newMeal.amount === undefined) newMeal.amount = 1;
                    if (newMeal.unit === undefined) newMeal.unit = '份';
                    if (!newMeal.time) newMeal.time = DEFAULT_MEAL_TIME[historyMealType.value];

                    if (editingIndex.value !== null) {
                        Object.assign(editingMeal, newMeal);
                        isNameAuto.value = false;
                        prepareScale();
                    } else {
                        newMeal.type = historyMealType.value;
                        if (!allData[selectedDate.value]) {
                            allData[selectedDate.value] = { planType: 'med', meals: [] };
                        }
                        allData[selectedDate.value].meals.push(newMeal);
                        sortMeals();
                        const k = newMeal.name.toLowerCase().trim();
                        if (templates[k]) {
                            templates[k].count = (templates[k].count || 0) + 1;
                            templates[k].lastUsed = selectedDate.value;
                            if (!templates[k].firstUsed) templates[k].firstUsed = selectedDate.value;
                        }
                        saveData();
                    }
                    showHistory.value = false;
                };

                const setPlanType = (type) => {
                    if (!allData[selectedDate.value]) {
                        allData[selectedDate.value] = { meals: [] };
                    }
                    const day = allData[selectedDate.value];
                    day.planType = type;
                    // 快照當前的目標數值到該日期
                    day.goals = JSON.parse(JSON.stringify(plans[type]));
                    saveData();
                };

                // 解析目標計畫：過去日期用快照（歷史紀錄），今天及之後永遠用當前 plans 設定
                const activePlan = (date, day) => {
                    const todayStr = formatDate(new Date());
                    if (date < todayStr && day?.goals) return day.goals;
                    return plans[day?.planType] || plans.med;
                };

                const updateFutureGoals = () => {
                    const todayStr = formatDate(new Date());
                    Object.keys(allData).forEach(date => {
                        if (date >= todayStr && allData[date].planType) {
                            allData[date].goals = JSON.parse(JSON.stringify(plans[allData[date].planType]));
                        }
                    });
                    saveData();
                };

                const autoCalculatePlans = () => {
                    const { gender, weight, height, age, activity, goal } = profile;
                    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
                    bmr = gender === 'male' ? bmr + 5 : bmr - 161;
                    const tdee = Math.round(bmr * activity);
                    
                    // 根據目標調整基準熱量 (減重通常減少 300-500 kcal，維持則與 TDEE 相當)
                    const base = goal === 'lose' ? tdee - 400 : tdee;
                    
                    // 動態計算蛋白質倍數 (根據活動量與目標)
                    let pMultiplier = 1.6;
                    if (goal === 'lose') {
                        if (activity <= 1.2) pMultiplier = 1.6;
                        else if (activity <= 1.375) pMultiplier = 1.9;
                        else if (activity <= 1.55) pMultiplier = 2.2;
                        else pMultiplier = 2.4;
                    } else {
                        if (activity <= 1.2) pMultiplier = 1.2;
                        else if (activity <= 1.375) pMultiplier = 1.5;
                        else if (activity <= 1.55) pMultiplier = 1.8;
                        else pMultiplier = 2.0;
                    }
                    
                    const pGrams = weight * pMultiplier; 

                    // 輔助函式：將單一數值轉換為範圍物件
                    const makeRange = (val, type) => {
                        const num = formatNum(val);
                        if (type === 'calories') return { min: Math.max(0, num - 100), max: num + 100 };
                        if (type === 'carbs') return { min: Math.max(0, num - 10), max: num + 10 };
                        return { min: Math.max(0, num - 5), max: num + 5 };
                    };
                    
                    // 根據目標計算各計畫數值
                    if (goal === 'lose') {
                        tempPlans.high = { 
                            calories: makeRange(base + 200, 'calories'), 
                            protein: makeRange(pGrams, 'protein'), 
                            carbs: makeRange((base + 200) * 0.45 / 4, 'carbs'), 
                            fat: makeRange((base + 200) * 0.25 / 9, 'fat') 
                        };
                        tempPlans.med = { 
                            calories: makeRange(base, 'calories'), 
                            protein: makeRange(pGrams, 'protein'), 
                            carbs: makeRange(base * 0.3 / 4, 'carbs'), 
                            fat: makeRange(base * 0.3 / 9, 'fat') 
                        };
                        tempPlans.low = { 
                            calories: makeRange(base - 200, 'calories'), 
                            protein: makeRange(pGrams, 'protein'), 
                            carbs: makeRange((base - 200) * 0.15 / 4, 'carbs'), 
                            fat: makeRange((base - 200) * 0.45 / 9, 'fat') 
                        };
                        tempPlans.rest = { 
                            calories: JSON.parse(JSON.stringify(tempPlans.high.calories)), 
                            protein: JSON.parse(JSON.stringify(tempPlans.high.protein)), 
                            carbs: JSON.parse(JSON.stringify(tempPlans.high.carbs)), 
                            fat: JSON.parse(JSON.stringify(tempPlans.low.fat)) 
                        };
                    } else {
                        // 維持身材邏輯
                        tempPlans.high = { 
                            calories: makeRange(base + 300, 'calories'), 
                            protein: makeRange(pGrams, 'protein'), 
                            carbs: makeRange((base + 300) * 0.55 / 4, 'carbs'), 
                            fat: makeRange((base + 300) * 0.2 / 9, 'fat') 
                        };
                        tempPlans.med = { 
                            calories: makeRange(base, 'calories'), 
                            protein: makeRange(pGrams, 'protein'), 
                            carbs: makeRange(base * 0.4 / 4, 'carbs'), 
                            fat: makeRange(base * 0.4 / 9, 'fat') 
                        };
                        tempPlans.low = { 
                            calories: makeRange(base - 200, 'calories'), 
                            protein: makeRange(pGrams, 'protein'), 
                            carbs: makeRange((base - 200) * 0.25 / 4, 'carbs'), 
                            fat: makeRange((base - 200) * 0.45 / 9, 'fat') 
                        };
                        tempPlans.rest = { 
                            calories: JSON.parse(JSON.stringify(tempPlans.high.calories)), 
                            protein: JSON.parse(JSON.stringify(tempPlans.high.protein)), 
                            carbs: JSON.parse(JSON.stringify(tempPlans.high.carbs)), 
                            fat: JSON.parse(JSON.stringify(tempPlans.low.fat)) 
                        };
                    }
                };

                const settingsStep = ref(1);

                const setCalorieCenter = (planKey, value) => {
                    const v = Number(value);
                    tempPlans[planKey].calories.min = Math.max(0, v - 100);
                    tempPlans[planKey].calories.max = v + 100;
                };

                const setNutrientCenter = (planKey, nutrient, value, delta) => {
                    const v = Number(value);
                    tempPlans[planKey][nutrient].min = Math.max(0, v - delta);
                    tempPlans[planKey][nutrient].max = v + delta;
                };

                const saveSettings = () => {
                    Object.assign(plans, JSON.parse(JSON.stringify(tempPlans)));
                    updateFutureGoals();
                    showSettings.value = false;
                    saveData();
                };

                const openSettings = () => {
                    Object.assign(tempPlans, JSON.parse(JSON.stringify(plans)));
                    settingsStep.value = 2;
                    showSettings.value = true;
                };

                const currentMonthYearDisplay = computed(() => {
                    return new Date(selectedDate.value).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
                });

                const getPlanLabel = (key) => {
                    const map = { high: '高碳日', med: '中碳日', low: '低碳日', rest: '自由日' };
                    return map[key];
                };

                // color 是餐別代表色,時間軸節點與資料庫面板共用同一份(原本兩處各自內嵌同樣的 hex)
                const mealTypes = [
                    { key: 'breakfast', icon: '🌅', name: '早餐', label: '🌅 早餐', color: '#6366f1' },
                    { key: 'lunch', icon: '☀️', name: '午餐', label: '☀️ 午餐', color: '#8b5cf6' },
                    { key: 'dinner', icon: '🌙', name: '晚餐', label: '🌙 晚餐', color: '#3b82f6' },
                    { key: 'snack', icon: '🍰', name: '點心', label: '🍰 點心', color: '#ec4899' }
                ];

                const WORKOUT_TYPES = [
                    { key: 'run', icon: '🏃', name: '慧跑' },
                    { key: 'walk', icon: '🚶', name: '快走' },
                    { key: 'bike', icon: '🚴', name: '單車' },
                    { key: 'swim', icon: '🏊', name: '游泳' },
                    { key: 'gym', icon: '🏋️', name: '重訓' },
                    { key: 'hike', icon: '🥾', name: '登山' },
                    { key: 'ball', icon: '⚽', name: '球類' },
                    { key: 'other', icon: '✨', name: '其他' }
                ];
                const getWorkoutMeta = (key) => WORKOUT_TYPES.find(w => w.key === key) || WORKOUT_TYPES[WORKOUT_TYPES.length - 1];
                const WORKOUT_COLOR = '#10b981'; // 運動代表色(emerald-500),節點與標籤共用

                // === 運動紀錄 ===
                const editingWorkout = reactive({ time: '07:00', type: 'run', duration: 30, name: '' });
                const editingWorkoutIndex = ref(null); // null = sheet 關閉
                const isAddingWorkout = ref(false);
                const workoutToDelete = ref(null);

                // 舊資料的 day object 沒有 workouts 欄位,寫入前補上
                const ensureWorkouts = () => {
                    if (!allData[selectedDate.value]) {
                        allData[selectedDate.value] = { planType: 'med', meals: [] };
                    }
                    if (!allData[selectedDate.value].workouts) {
                        allData[selectedDate.value].workouts = [];
                    }
                    return allData[selectedDate.value].workouts;
                };

                const addWorkout = () => {
                    Object.assign(editingWorkout, { time: nowHHMM(), type: 'run', duration: 30, name: '' });
                    editingWorkoutIndex.value = -1; // -1 = 新增中,存檔才進陣列
                    isAddingWorkout.value = true;
                };

                const startEditWorkout = (index) => {
                    const w = allData[selectedDate.value]?.workouts?.[index];
                    if (!w) return;
                    // 沒有 name 的記錄要顯式清空,否則 Object.assign 會留著上一筆編輯的自訂名稱
                    Object.assign(editingWorkout, { name: '' }, JSON.parse(JSON.stringify(w)));
                    editingWorkoutIndex.value = index;
                    isAddingWorkout.value = false;
                };

                const cancelEditWorkout = () => {
                    editingWorkoutIndex.value = null;
                    isAddingWorkout.value = false;
                };

                const saveWorkout = () => {
                    const duration = Number(editingWorkout.duration);
                    if (!editingWorkout.time || !(duration > 0)) return;
                    const record = { time: editingWorkout.time, type: editingWorkout.type, duration };
                    // 自訂名稱只在「其他」有意義,換成其他類型時不留殘值
                    const name = editingWorkout.type === 'other' ? String(editingWorkout.name || '').trim() : '';
                    if (name) record.name = name;
                    const list = ensureWorkouts();
                    if (isAddingWorkout.value) {
                        list.push(record);
                    } else if (editingWorkoutIndex.value !== null && list[editingWorkoutIndex.value]) {
                        list[editingWorkoutIndex.value] = record;
                    }
                    editingWorkoutIndex.value = null;
                    isAddingWorkout.value = false;
                    saveData();
                };

                const confirmDeleteWorkout = (index) => { workoutToDelete.value = index; };

                const executeDeleteWorkout = () => {
                    const list = allData[selectedDate.value]?.workouts;
                    if (list && workoutToDelete.value !== null) list.splice(workoutToDelete.value, 1);
                    workoutToDelete.value = null;
                    saveData();
                };

                // 餐點與運動合併成一條時間軸
                const timeline = computed(() => {
                    const day = allData[selectedDate.value];
                    return buildTimeline(day?.meals, day?.workouts);
                });

                const getMealMeta = (key) => mealTypes.find(t => t.key === key) || mealTypes[1];

                // 時間軸一列的代表色:餐點用餐別色,運動用運動色。節點與標籤都走這個,避免兩處各寫一份
                const rowColor = (row) => row.kind === 'workout' ? WORKOUT_COLOR : getMealMeta(row.data.type).color;
                const rowLabel = (row) => {
                    const meta = row.kind === 'workout' ? getWorkoutMeta(row.data.type) : getMealMeta(row.data.type);
                    return meta.icon + meta.name;
                };

                const calendarDays = computed(() => {
                    const year = pickerMonth.value.getFullYear();
                    const month = pickerMonth.value.getMonth();
                    const firstDay = new Date(year, month, 1);
                    const lastDay = new Date(year, month + 1, 0);

                    let startDay = firstDay.getDay();
                    if (startDay === 0) startDay = 7;
                    startDay -= 1;

                    const days = [];
                    const prevMonthLastDay = new Date(year, month, 0).getDate();
                    for (let i = startDay - 1; i >= 0; i--) {
                        const d = new Date(year, month - 1, prevMonthLastDay - i);
                        days.push({ date: formatDate(d), dayNum: d.getDate(), currentMonth: false });
                    }
                    for (let i = 1; i <= lastDay.getDate(); i++) {
                        const d = new Date(year, month, i);
                        days.push({ date: formatDate(d), dayNum: i, currentMonth: true });
                    }
                    const remaining = 42 - days.length;
                    for (let i = 1; i <= remaining; i++) {
                        const d = new Date(year, month + 1, i);
                        days.push({ date: formatDate(d), dayNum: i, currentMonth: false });
                    }
                    return days;
                });

                const changePickerMonth = async (dir) => {
                    const newMonth = new Date(pickerMonth.value.getFullYear(), pickerMonth.value.getMonth() + dir, 1);
                    pickerMonth.value = newMonth;
                    await loadMonthData(newMonth);
                };

                const goToToday = async () => {
                    const now = new Date();
                    selectedDate.value = formatDate(now);
                    pickerMonth.value = new Date(now.getFullYear(), now.getMonth(), 1);
                    await loadMonthData(now);
                };

                // 分月載入資料 (按需載入)
                const loadedMonths = new Set();
                const loadMonthData = async (date) => {
                    if (!user.value) return;
                    const year = date.getFullYear();
                    const month = date.getMonth();
                    const monthKey = `${year}-${month}`;
                    
                    if (loadedMonths.has(monthKey)) return;
                    loadedMonths.add(monthKey);

                    const start = formatDate(new Date(year, month, 1));
                    const end = formatDate(new Date(year, month + 1, 0));

                    const q = query(
                        collection(db, 'artifacts', appId, 'users', user.value.uid, 'dailyRecords'),
                        where('date', '>=', start),
                        where('date', '<=', end)
                    );

                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        allData[doc.id] = doc.data();
                    });
                };

                const initApp = async () => {
                    let firebaseConfig;
                    try {
                        const response = await fetch('/firebase-config.json');
                        if (response.ok) firebaseConfig = await response.json();
                        else throw new Error();
                    } catch (e) {
                        if (typeof __firebase_config !== 'undefined') firebaseConfig = JSON.parse(__firebase_config);
                        else return;
                    }

                    const app = initializeApp(firebaseConfig);
                    auth = getAuth(app);
                    
                    // 使用新的 Firestore 快取設定 (取代已棄用的 enableIndexedDbPersistence)
                    db = initializeFirestore(app, {
                        localCache: persistentLocalCache()
                    });

                    onAuthStateChanged(auth, async (u) => {
                        user.value = u;
                        if (u) {
                            const settingsRef = doc(db, 'artifacts', appId, 'users', u.uid, 'settings', 'dietData');
                            
                            // 監聽全局設定
                            onSnapshot(settingsRef, async (snap) => {
                                if (snap.exists()) {
                                    const data = snap.data();
                                    if (data.plans) Object.assign(plans, data.plans);
                                    if (data.profile) Object.assign(profile, data.profile);
                                    if (data.templates) Object.assign(templates, data.templates);

                                    // 點 1: 資料遷移 (Migration) - 如果發現舊的大型 allData
                                    if (data.allData) {
                                        console.log("偵測到舊架構，開始資料遷移...");
                                        const batch = writeBatch(db);
                                        const dailyCol = collection(db, 'artifacts', appId, 'users', u.uid, 'dailyRecords');
                                        
                                        Object.keys(data.allData).forEach(date => {
                                            const dayRef = doc(dailyCol, date);
                                            batch.set(dayRef, { ...data.allData[date], date });
                                            // 同時同步到本地快取
                                            allData[date] = data.allData[date];
                                        });
                                        
                                        // 遷移完成後移除舊欄位
                                        batch.update(settingsRef, { allData: deleteField() });
                                        await batch.commit();
                                        console.log("資料遷移完成。");
                                    }
                                }
                                initialized.value = true;
                            });

                            // 初始載入：僅載入本月資料
                            await loadMonthData(new Date());
                        } else {
                            initialized.value = true;
                        }
                    });
                };

                const isRecalculating = ref(false);
                const recalcCounts = async () => {
                    if (!user.value || isRecalculating.value) return;
                    isRecalculating.value = true;
                    try {
                        const allRecordsRef = collection(db, 'artifacts', appId, 'users', user.value.uid, 'dailyRecords');
                        const snap = await getDocs(allRecordsRef);
                        const counts = new Map();
                        const first = new Map(); // 最早使用日
                        const last = new Map();  // 最近使用日
                        snap.forEach(docSnap => {
                            const day = docSnap.data();
                            const date = day.date || docSnap.id;
                            if (day.meals) {
                                day.meals.forEach(m => {
                                    if (m.name) {
                                        const k = m.name.toLowerCase().trim();
                                        counts.set(k, (counts.get(k) || 0) + 1);
                                        if (date) {
                                            if (!first.has(k) || date < first.get(k)) first.set(k, date);
                                            if (!last.has(k) || date > last.get(k)) last.set(k, date);
                                        }
                                    }
                                });
                            }
                        });
                        Object.keys(templates).forEach(k => {
                            if (templates[k]) {
                                templates[k].count = counts.get(k) || 0;
                                templates[k].firstUsed = first.get(k) || null;
                                templates[k].lastUsed = last.get(k) || null;
                            }
                        });
                        saveData();
                    } finally {
                        isRecalculating.value = false;
                    }
                };

                // ===== 餐點資料庫管理面板 =====
                const showManage = ref(false);
                const manageSearch = ref('');
                const manageSortBy = ref('lastUsed'); // count, firstUsed, lastUsed, calories, carbs, protein, fat
                const manageSortOrder = ref('asc');   // asc, desc
                const manageSelected = ref(new Set());
                const manageConfirmDelete = ref(false);
                // 進階篩選
                const manageShowFilters = ref(false);
                const manageType = ref('all');       // all, general(一般), combo(組合)
                const manageDateMode = ref('off');   // off, range(區間內), before(早於門檻)
                const manageDateStart = ref('');
                const manageDateEnd = ref('');
                const manageBeforeDate = ref('');     // before 模式的門檻日(最近使用日早於此)
                const manageCountMin = ref('');
                const manageCountMax = ref('');

                const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return formatDate(d); };
                const setManageRangePreset = (type) => {
                    manageDateMode.value = 'range';
                    const now = new Date();
                    if (type === 'week') { manageDateStart.value = daysAgo(6); manageDateEnd.value = formatDate(now); }
                    else if (type === 'month') { manageDateStart.value = daysAgo(29); manageDateEnd.value = formatDate(now); }
                    else if (type === 'halfYear') { manageDateStart.value = daysAgo(182); manageDateEnd.value = formatDate(now); }
                    else if (type === 'thisMonth') { manageDateStart.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 1)); manageDateEnd.value = formatDate(now); }
                    else if (type === 'lastMonth') { manageDateStart.value = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)); manageDateEnd.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 0)); }
                };
                const setManageBeforePreset = (days) => {
                    manageDateMode.value = 'before';
                    manageBeforeDate.value = daysAgo(days);
                };
                const clearManageFilters = () => {
                    manageType.value = 'all';
                    manageDateMode.value = 'off';
                    manageDateStart.value = ''; manageDateEnd.value = ''; manageBeforeDate.value = '';
                    manageCountMin.value = ''; manageCountMax.value = '';
                };
                const manageFilterCount = computed(() => {
                    let n = 0;
                    if (manageType.value !== 'all') n++;
                    if (manageDateMode.value === 'range' && (manageDateStart.value || manageDateEnd.value)) n++;
                    if (manageDateMode.value === 'before' && manageBeforeDate.value) n++;
                    if (manageCountMin.value !== '' || manageCountMax.value !== '') n++;
                    return n;
                });

                const openManage = async () => {
                    manageSelected.value = new Set();
                    manageSearch.value = '';
                    manageConfirmDelete.value = false;
                    manageShowFilters.value = false;
                    clearManageFilters();
                    showManage.value = true;
                    await recalcCounts(); // 開面板時掃一次,補齊 first/last 使用日
                };
                const closeManage = () => {
                    showManage.value = false;
                    manageConfirmDelete.value = false;
                };
                const toggleManageSelect = (key) => {
                    const s = new Set(manageSelected.value);
                    if (s.has(key)) s.delete(key); else s.add(key);
                    manageSelected.value = s;
                };

                const manageList = computed(() => {
                    let list = Object.entries(templates)
                        .filter(([, t]) => t && t.name)
                        .map(([key, t]) => ({ key, ...t, count: Number(t.count) || 0 }));

                    if (manageSearch.value) {
                        const term = manageSearch.value.toLowerCase().trim();
                        list = list.filter(m => m.name.toLowerCase().includes(term));
                    }

                    // 類型：一般(無品項) / 組合(有品項)
                    if (manageType.value === 'general') list = list.filter(m => !m.items || m.items.length === 0);
                    else if (manageType.value === 'combo') list = list.filter(m => m.items && m.items.length > 0);

                    // 日期(最近使用日)
                    if (manageDateMode.value === 'range' && (manageDateStart.value || manageDateEnd.value)) {
                        list = list.filter(m => m.lastUsed
                            && (!manageDateStart.value || m.lastUsed >= manageDateStart.value)
                            && (!manageDateEnd.value || m.lastUsed <= manageDateEnd.value));
                    } else if (manageDateMode.value === 'before' && manageBeforeDate.value) {
                        // 最近使用日早於門檻(含從未使用者)
                        list = list.filter(m => !m.lastUsed || m.lastUsed < manageBeforeDate.value);
                    }

                    // 次數範圍
                    const cmin = manageCountMin.value, cmax = manageCountMax.value;
                    if (cmin !== '' && !isNaN(cmin)) list = list.filter(m => m.count >= Number(cmin));
                    if (cmax !== '' && !isNaN(cmax)) list = list.filter(m => m.count <= Number(cmax));

                    const by = manageSortBy.value;
                    const dir = manageSortOrder.value === 'asc' ? 1 : -1;
                    const dateKeys = { firstUsed: 1, lastUsed: 1 };
                    list.sort((a, b) => {
                        if (dateKeys[by]) {
                            // 無日期者一律排最後(不論升降)
                            const av = a[by], bv = b[by];
                            if (!av && !bv) return 0;
                            if (!av) return 1;
                            if (!bv) return -1;
                            return av < bv ? -dir : av > bv ? dir : 0;
                        }
                        return ((Number(a[by]) || 0) - (Number(b[by]) || 0)) * dir;
                    });
                    return list;
                });

                const manageAllSelected = computed(() =>
                    manageList.value.length > 0 && manageList.value.every(m => manageSelected.value.has(m.key)));

                const toggleManageSelectAll = () => {
                    if (manageAllSelected.value) {
                        manageSelected.value = new Set();
                    } else {
                        manageSelected.value = new Set(manageList.value.map(m => m.key));
                    }
                };

                const executeManageDelete = () => {
                    manageSelected.value.forEach(key => { delete templates[key]; });
                    manageSelected.value = new Set();
                    manageConfirmDelete.value = false;
                    saveData();
                };

                const saveData = () => {
                    if (!user.value) return;
                    clearTimeout(window.saveTimer);
                    window.saveTimer = setTimeout(async () => {
                        saving.value = true;
                        try {
                            const batch = writeBatch(db);
                            
                            // 1. 儲存全局設定
                            const settingsRef = doc(db, 'artifacts', appId, 'users', user.value.uid, 'settings', 'dietData');
                            batch.set(settingsRef, {
                                plans: JSON.parse(JSON.stringify(plans)),
                                profile: JSON.parse(JSON.stringify(profile)),
                                templates: JSON.parse(JSON.stringify(templates))
                            }, { merge: true });

                            // 2. 僅儲存「目前選中日期」的紀錄 (點 1: 分片寫入)
                            const todayData = allData[selectedDate.value];
                            if (todayData) {
                                const dayRef = doc(db, 'artifacts', appId, 'users', user.value.uid, 'dailyRecords', selectedDate.value);
                                batch.set(dayRef, { ...JSON.parse(JSON.stringify(todayData)), date: selectedDate.value });
                            }

                            await batch.commit();
                        } catch (e) {
                            console.error("同步失敗", e);
                        } finally {
                            saving.value = false;
                        }
                    }, 800);
                };

                // 當下時間 'HH:MM',新增餐點/運動時帶預設值
                const nowHHMM = () => {
                    const d = new Date();
                    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                };

                // 依時間升冪排序;舊資料無 time 時 mealTime() 會用餐別預設值
                const sortMeals = () => {
                    const meals = allData[selectedDate.value]?.meals;
                    if (meals) {
                        meals.sort((a, b) => mealTime(a).localeCompare(mealTime(b)));
                    }
                };

                const startEdit = (index) => {
                    const meal = allData[selectedDate.value].meals[index];
                    const copiedMeal = JSON.parse(JSON.stringify(meal));
                    if (!copiedMeal.items) copiedMeal.items = [];
                    // 舊資料沒有 time,Object.assign 不會覆蓋 → 要顯式補上餐別預設值,否則殘留上一筆的時間
                    if (!copiedMeal.time) copiedMeal.time = mealTime(copiedMeal);
                    Object.assign(editingMeal, copiedMeal);

                    // 檢查名稱是否與品項串接相符，判斷是否為自動生成
                    const names = editingMeal.items.map(i => i.name).filter(n => n).join(' + ');
                    isNameAuto.value = !editingMeal.name || editingMeal.name === names;

                    editingIndex.value = index;
                    isAddingMeal.value = false;
                    mealTimeIsSuggestion.value = false; // 既有紀錄的時間是真資料
                    skipHistorySave.value = false;
                    lastAmount.value = editingMeal.amount;
                    tempMealBackup.value = JSON.parse(JSON.stringify(copiedMeal));
                };

                // 新增餐點時的時間只是建議值(帶入當下時間),切餐別可覆蓋;
                // 但編輯既有餐點或使用者手動調過時間後就是真資料,切餐別不能蓋掉
                const mealTimeIsSuggestion = ref(false);

                const pickMealType = (key) => {
                    editingMeal.type = key;
                    if (mealTimeIsSuggestion.value || !editingMeal.time) editingMeal.time = DEFAULT_MEAL_TIME[key];
                };

                // type 傳 null 時依當下時間推導餐別與時間;傳餐別時用該餐別的預設時間
                const addMeal = (type = null) => {
                    if (!allData[selectedDate.value]) {
                        allData[selectedDate.value] = { planType: 'med', meals: [] };
                    }
                    const time = type ? DEFAULT_MEAL_TIME[type] : nowHHMM();
                    const mealType = type || mealTypeForTime(time);
                    const newMeal = { type: mealType, time, name: '', amount: 1, unit: '份', calories: 0, carbs: 0, protein: 0, fat: 0, items: [] };
                    Object.assign(editingMeal, newMeal);
                    isNameAuto.value = true;
                    const newIndex = allData[selectedDate.value].meals.push(newMeal) - 1;
                    editingIndex.value = newIndex;
                    isAddingMeal.value = true;
                    mealTimeIsSuggestion.value = true; // 新增時的時間只是建議值,切餐別可覆蓋
                    skipHistorySave.value = false;
                    lastAmount.value = 1;
                    tempMealBackup.value = null;
                };

                const cancelEdit = () => {
                    if (isAddingMeal.value && editingIndex.value !== null) {
                        allData[selectedDate.value].meals.splice(editingIndex.value, 1);
                    } else if (tempMealBackup.value && editingIndex.value !== null) {
                        allData[selectedDate.value].meals[editingIndex.value] = tempMealBackup.value;
                    }
                    editingIndex.value = null;
                    isAddingMeal.value = false;
                    tempMealBackup.value = null;
                };

                const saveMeal = (syncOption = null) => {
                    if (!editingMeal.name) return;
                    const k = editingMeal.name.toLowerCase().trim();
                    const currentNormalized = {
                        ...editingMeal,
                        amount: 1,
                        time: undefined, // 時間屬於「當天那一筆」,不該被資料庫記住
                        calories: formatFloat(editingMeal.calories / (editingMeal.amount || 1)),
                        carbs: formatFloat(editingMeal.carbs / (editingMeal.amount || 1)),
                        protein: formatFloat(editingMeal.protein / (editingMeal.amount || 1)),
                        fat: formatFloat(editingMeal.fat / (editingMeal.amount || 1))
                    };
                    const existing = templates[k];
                    if (!skipHistorySave.value) {
                        if (syncOption === null && existing) {
                            const isDifferent =
                                Math.abs(existing.calories - currentNormalized.calories) > 0.1 ||
                                Math.abs(existing.carbs - currentNormalized.carbs) > 0.1 ||
                                Math.abs(existing.protein - currentNormalized.protein) > 0.1 ||
                                Math.abs(existing.fat - currentNormalized.fat) > 0.1;

                            const nutrientsChangedFromBackup = !tempMealBackup.value || (
                                Math.abs(tempMealBackup.value.calories - editingMeal.calories) > 0.1 ||
                                Math.abs(tempMealBackup.value.carbs - editingMeal.carbs) > 0.1 ||
                                Math.abs(tempMealBackup.value.protein - editingMeal.protein) > 0.1 ||
                                Math.abs(tempMealBackup.value.fat - editingMeal.fat) > 0.1
                            );

                            if (isDifferent && nutrientsChangedFromBackup) {
                                showSyncModal.value = true;
                                return;
                            }
                        }
                        if (syncOption === 'sync' || !existing) {
                            templates[k] = {
                                ...currentNormalized,
                                count: existing?.count || 0
                            };
                        }
                        
                        // 只有在「新增」餐點時，才增加使用次數
                        if (isAddingMeal.value && templates[k]) {
                            templates[k].count = (templates[k].count || 0) + 1;
                            templates[k].lastUsed = selectedDate.value;
                            if (!templates[k].firstUsed) templates[k].firstUsed = selectedDate.value;
                        }
                    }
                    if (editingIndex.value !== null) {
                        allData[selectedDate.value].meals[editingIndex.value] = JSON.parse(JSON.stringify(editingMeal));
                    }
                    sortMeals();
                    editingIndex.value = null;
                    isAddingMeal.value = false;
                    showSyncModal.value = false;
                    saveData();
                };

                const saveToHistoryOnly = () => {
                    if (!editingMeal.name) return;
                    const k = editingMeal.name.toLowerCase().trim();
                    const currentNormalized = {
                        ...editingMeal,
                        amount: 1,
                        calories: formatFloat(editingMeal.calories / (editingMeal.amount || 1)),
                        carbs: formatFloat(editingMeal.carbs / (editingMeal.amount || 1)),
                        protein: formatFloat(editingMeal.protein / (editingMeal.amount || 1)),
                        fat: formatFloat(editingMeal.fat / (editingMeal.amount || 1)),
                        time: undefined, // 時間屬於「當天那一筆」,不該被資料庫記住
                        count: templates[k]?.count || 0
                    };
                    templates[k] = currentNormalized;
                    
                    if (isAddingMeal.value && editingIndex.value !== null) {
                        allData[selectedDate.value].meals.splice(editingIndex.value, 1);
                    }
                    
                    editingIndex.value = null;
                    isAddingMeal.value = false;
                    saveData();
                };

                const executeDeleteHistory = () => {
                    if (historyToDelete.value) {
                        const k = historyToDelete.value.name.toLowerCase().trim();
                        delete templates[k];
                        historyToDelete.value = null;
                        saveData();
                    }
                };

                const exportCSV = async () => {
                    await ensureRangeLoaded(); // 同上:未載入的月份不會出現在 allData
                    // 文字欄位一律加引號並轉義,否則名稱含逗號會讓整列欄位錯位
                    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
                    const rows = [['日期', '時間', '類別', '計畫類型', '名稱', '份量', '單位', '熱量', '淨碳水', '蛋白質', '脂肪', '品項內容'].join(',')];

                    Object.keys(allData).sort().forEach(date => {
                        const day = allData[date];
                        const plan = getPlanLabel(day.planType) || '';
                        (day.meals || []).forEach(m => {
                            const itemsStr = m.items ? m.items.map(i => `${i.name}(${i.amount}${i.unit})`).join('; ') : '';
                            rows.push([
                                date, mealTime(m), q(getMealMeta(m.type).name), q(plan), q(m.name),
                                m.amount, q(m.unit || '份'), m.calories, m.carbs, m.protein, m.fat, q(itemsStr)
                            ].join(','));
                        });
                        (day.workouts || []).forEach(w => {
                            rows.push([
                                date, w.time || '', q('運動'), q(plan),
                                q(w.name || getWorkoutMeta(w.type).name),
                                w.duration, q('分鐘'), '', '', '', '', ''
                            ].join(','));
                        });
                    });

                    // BOM 是必要的:少了它 Excel 會用系統編碼讀 UTF-8,中文全部變亂碼
                    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", `健康飲食紀錄_${new Date().toLocaleDateString('sv-SE')}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                };

                const onlyNumber = (e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                };

                onMounted(() => {
                    updateTheme();
                    initApp();
                });

                return {
                    appVersion, skipHistorySave,
                    isDark, toggleTheme,
                    initialized, user, saving, showSettings, showHistory, showMonthPicker, historySearch, historySortBy, historySortOrder, historyTab, selectedDate, pickerMonth, loginEmail, loginPassword,
                    openHistory, closeHistory, historyPickMode, pendingHistoryMeal, chooseHistoryMeal, confirmHistoryAdd, priorityNutrient, priorityNutrientLabel,
                    pendingAmount, pendingAmountValid, pendingScaled, pendingType, pendingTime, pickPendingType, pendingTimeIsSuggestion,
                    editingIndex, isAddingMeal, mealToDelete, historyToDelete, nutrientKeys, profile, plans, tempPlans, allData, mealHistory, visibleMealHistory, handleHistoryScroll, editingMeal, showSyncModal, templates,
                    currentMonthYearDisplay, calculatedTDEE, formatNum, formatFloat, scaleNutrients, lastAmount, prepareScale, onlyNumber,
                    settingsStep, setCalorieCenter, setNutrientCenter,
                    calendarDays, changePickerMonth, goToToday,
                    currentDayRecord: computed(() => {
                        if (!allData[selectedDate.value]) { allData[selectedDate.value] = { planType: 'med', meals: [] }; }
                        return allData[selectedDate.value];
                    }),
                    currentPlan: computed(() => {
                        const day = allData[selectedDate.value];
                        return activePlan(selectedDate.value, day);
                    }),
                    getPlanLabel,
                    getDailySum: (type) => (allData[selectedDate.value]?.meals || []).reduce((s, m) => s + (Number(m[type]) || 0), 0),
                    getGoalDisplay: (type, planObj = null) => {
                        const day = allData[selectedDate.value];
                        const plan = planObj || activePlan(selectedDate.value, day);
                        const goal = plan[type];
                        if (typeof goal === 'object' && goal !== null) {
                            return `${Math.round((goal.min + goal.max) / 2)}`;
                        }
                        return goal || 0;
                    },
                    getGap: (type) => goalGap(type),
                    isGoalInRange: (type) => {
                        const day = allData[selectedDate.value];
                        const plan = activePlan(selectedDate.value, day);
                        const goal = plan[type];
                        const sum = (allData[selectedDate.value]?.meals || []).reduce((s, m) => s + (Number(m[type]) || 0), 0);
                        if (typeof goal === 'object' && goal !== null) {
                            return sum >= goal.min && sum <= goal.max;
                        }
                        return false;
                    },
                    getGoalMidpoint: (type) => goalMidpoint(type),
                    changeMonth: async (dir) => {
                        const d = new Date(selectedDate.value);
                        const oldDay = d.getDate();
                        d.setMonth(d.getMonth() + dir);
                        if (d.getDate() !== oldDay) d.setDate(0);
                        selectedDate.value = formatDate(d);
                        pickerMonth.value = new Date(d.getFullYear(), d.getMonth(), 1);
                        await loadMonthData(pickerMonth.value);
                    },
                    mealTypes, nowHHMM, DEFAULT_MEAL_TIME,
                    timeline, WORKOUT_TYPES, getWorkoutMeta, getMealMeta, rowColor, rowLabel, pickMealType, mealTimeIsSuggestion,
                    editingWorkout, editingWorkoutIndex, isAddingWorkout, addWorkout, startEditWorkout,
                    saveWorkout, cancelEditWorkout, workoutToDelete, confirmDeleteWorkout, executeDeleteWorkout,
                    dragRow, dragPos,
                    onRowPointerDown, onRowPointerMove, onRowTouchMove, onRowPointerUp, cancelRowDrag,
                    addMeal, startEdit, cancelEdit, saveMeal, addFromHistory, saveToHistoryOnly,
                    confirmDeleteHistory: (item) => { historyToDelete.value = item; }, executeDeleteHistory,
                    confirmDelete: (i) => { mealToDelete.value = i; },
                    executeDelete: () => {
                        const meal = allData[selectedDate.value].meals[mealToDelete.value];
                        if (meal && meal.name) {
                            const k = meal.name.toLowerCase().trim();
                            if (templates[k] && templates[k].count > 0) {
                                templates[k].count--;
                            }
                        }
                        allData[selectedDate.value].meals.splice(mealToDelete.value, 1);
                        mealToDelete.value = null;
                        saveData();
                    },
                    getDayStats: (date) => {
                        const record = allData[date];
                        if (!record || !record.planType) return null;
                        const plan = activePlan(date, record);
                        const intake = (record.meals || []).reduce((s, m) => s + (Number(m.calories) || 0), 0);
                        
                        const goalObj = plan.calories;
                        const minGoal = typeof goalObj === 'object' ? goalObj.min : (goalObj || 1);
                        const maxGoal = typeof goalObj === 'object' ? goalObj.max : (goalObj || 1);
                        
                        let progress = 0;
                        if (intake < minGoal) {
                            progress = (intake / minGoal) * 100;
                        } else if (intake <= maxGoal) {
                            progress = 100;
                        } else {
                            // 超出範圍，顯示為紅色/特殊狀態 (這裡簡單處理為 100+)
                            progress = 100;
                        }
                        
                        const colorMap = { high: 'var(--c-high)', med: 'var(--c-med)', low: 'var(--c-low)', rest: 'var(--c-rest)' };
                        return { percent: progress, color: colorMap[record.planType] };
                    },
                    getNutrientPercent: (key, isTarget) => {
                        const multipliers = { carbs: 4, protein: 4, fat: 9 };
                        const mult = multipliers[key];
                        const plan = activePlan(selectedDate.value, allData[selectedDate.value]);

                        if (isTarget) {
                            const getVal = (k) => {
                                const g = plan[k];
                                return typeof g === 'object' ? (g.min + g.max) / 2 : (g || 0);
                            };
                            const total = (getVal('carbs') * 4) + (getVal('protein') * 4) + (getVal('fat') * 9) || 1;
                            return Math.round((getVal(key) * mult / total) * 100);
                        } else {
                            const meals = allData[selectedDate.value]?.meals || [];
                            const c = meals.reduce((s, m) => s + (Number(m.carbs) || 0), 0);
                            const p = meals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
                            const f = meals.reduce((s, m) => s + (Number(m.fat) || 0), 0);
                            const totalCal = (c * 4) + (p * 4) + (f * 9);
                            if (totalCal === 0) return 0;
                            const val = meals.reduce((s, m) => s + (Number(m[key]) || 0), 0);
                            return Math.round((val * mult / totalCal) * 100);
                        }
                    },
                    setPlanType, autoCalculatePlans, exportCSV, saveData, recalcCounts, isRecalculating,
                    showManage, openManage, closeManage, manageSearch, manageSortBy, manageSortOrder,
                    manageSelected, manageConfirmDelete, manageList, manageAllSelected,
                    toggleManageSelect, toggleManageSelectAll, executeManageDelete,
                    manageShowFilters, manageType, manageDateMode, manageDateStart, manageDateEnd,
                    manageBeforeDate, manageCountMin, manageCountMax, manageFilterCount,
                    setManageRangePreset, setManageBeforePreset, clearManageFilters,
                    openSettings, saveSettings,
                    addItem, removeItem, saveItemToHistory, canSaveItemToHistory, updateTotalsFromItems,
                    activeSuggestItem, itemSuggestions, applyItemSuggestion, itemSuggestPage, suggestPageCount, pagedSuggestions,
                    beginItemAmount, changeItemAmount,
                    quickNutrientInput, parseQuickInput, parseItemInput,
                    showExportModal, isExporting, exportRange, exportPDF, getRangeStats, exportStats, dayTimeline,
                    excludedDates, exportDateList, toggleExcludedDate, toggleAllExportDates, setQuickRange,
                    isMobile, screenWidth, isCalendarExpanded, toggleCalendar, showMonthModal, showCalendarModal, jumpYear, jumpToMonth, showMobileMenu,
                    handleAuth: async (mode) => {
                        try {
                            mode === 'login'
                                ? await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value)
                                : await createUserWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
                        } catch (e) { alert('驗證失敗'); }
                    },
                    handleAnonymous: () => signInAnonymously(auth),
                    handleLogout: () => signOut(auth),
                    reloadData: () => window.location.reload(true)
                };
            }
        }).mount('#app');
