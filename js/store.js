// 本地存储层：历史、错词库、购物车、进度、设置、上次标签
const Store = (function () {
  const PREFIX = 'dict.v1.';
  const K = { history: 'history', wrong: 'wrong', cart: 'cart', plan: 'plan', settings: 'settings', lastTab: 'lasttab', custom: 'custom' };
  function get(k, def) { try { const v = localStorage.getItem(PREFIX + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} }

  // ---------- 教材自定义修改层（编辑/删除/新增，持久化） ----------
  const TABLES = ['识字表', '写字表', '词语表'];
  const CUST_KEY = 'dict.cust.v1';
  function loadCust() {
    try {
      const c = JSON.parse(localStorage.getItem(PREFIX + CUST_KEY) || '{}');
      return Object.assign({ lessons: {}, deleted: [], added: [] }, c);
    } catch (e) { return { lessons: {}, deleted: [], added: [] }; }
  }
  function saveCust(c) { try { localStorage.setItem(PREFIX + CUST_KEY, JSON.stringify(c)); } catch (e) {} }
  function slotId(g, sem, table, idx) { return g + '|' + sem + '|' + table + '|' + idx; }

  // 在教材原数据之上叠加用户修改，得到当前生效数据
  function getEffectiveData() {
    const base = window.APP_DATA;
    const cust = loadCust();
    const deleted = new Set(cust.deleted);
    const grades = base.grades.map(gd => {
      const tables = {};
      TABLES.forEach(t => {
        const arr = gd.tables[t] || [];
        const out = [];
        arr.forEach((l, idx) => {
          const sid = slotId(gd.grade, gd.sem, t, idx);
          if (deleted.has(sid)) return;
          const ed = cust.lessons[sid];
          if (ed) {
            out.push({ lesson: (ed.label != null ? ed.label : l.lesson), items: (ed.items != null ? ed.items : l.items), note: l.note, _meta: { kind: 'base', sid, idx } });
          } else {
            out.push({ lesson: l.lesson, items: l.items, flag: l.flag, note: l.note, _meta: { kind: 'base', sid, idx } });
          }
        });
        cust.added.forEach(a => { if (a.grade === gd.grade && a.sem === gd.sem && a.table === t) out.push({ lesson: a.label, items: a.items, added: true, _meta: { kind: 'added', id: a.id } }); });
        tables[t] = out;
      });
      return { grade: gd.grade, sem: gd.sem, tables };
    });
    return { version: base.version, grades };
  }
  function editLesson(meta, label, items) {
    const c = loadCust();
    if (meta.kind === 'base') { c.lessons[meta.sid] = { label, items }; }
    else { const a = c.added.find(x => x.id === meta.id); if (a) { a.label = label; a.items = items; } }
    saveCust(c);
  }
  function deleteLesson(meta) {
    const c = loadCust();
    if (meta.kind === 'base') { if (!c.deleted.includes(meta.sid)) c.deleted.push(meta.sid); }
    else { c.added = c.added.filter(x => x.id !== meta.id); }
    saveCust(c);
  }
  function addLesson(g, sem, table, label, items) {
    const c = loadCust();
    c.added.push({ id: 'add_' + Date.now() + '_' + Math.floor(Math.random() * 1000), grade: g, sem, table, label, items });
    saveCust(c);
  }
  function getCust() { return loadCust(); }
  function importCust(obj) {
    if (obj && obj.lessons && obj.added) { saveCust({ lessons: obj.lessons || {}, deleted: obj.deleted || [], added: obj.added || [] }); return true; }
    return false;
  }
  function resetCust() { saveCust({ lessons: {}, deleted: [], added: [] }); }

  return {
    getHistory: () => get(K.history, []),
    setHistory: (h) => set(K.history, h),
    getWrong: () => get(K.wrong, []),
    setWrong: (w) => set(K.wrong, w),
    getCart: () => get(K.cart, []),
    setCart: (c) => set(K.cart, c),
    getCustom: () => get(K.custom, []),
    setCustom: (arr) => set(K.custom, arr),
    getPlan: () => get(K.plan, {}),
    setPlan: (p) => set(K.plan, p),
    getSettings: () => get(K.settings, { reads: 2, interval: 1.5, rate: 0.9, pitch: 1.15, voiceURI: '', ttsSource: 'cloud' }),
    setSettings: (s) => set(K.settings, s),
    getLastTab: () => get(K.lastTab, 'tables'),
    setLastTab: (t) => set(K.lastTab, t),

    // 加入购物车：按 key 去重并合并 items
    pushCart(item) {
      const c = get(K.cart, []);
      const ex = c.find(x => x.key === item.key);
      if (ex) {
        item.items.forEach(w => { if (!ex.items.includes(w)) ex.items.push(w); });
        set(K.cart, c); return false;
      }
      c.push(item); set(K.cart, c); return true;
    },
    removeCart(key) { set(K.cart, get(K.cart, []).filter(x => x.key !== key)); },
    clearCart() { set(K.cart, []); },

    // 自定义修改层
    getEffectiveData,
    editLesson,
    deleteLesson,
    addLesson,
    getCust,
    importCust,
    resetCust,
  };
})();
