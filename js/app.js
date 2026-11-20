// 主逻辑：四个标签页 + 听写会话 + 日历筛选 + 自定义词组（含教材编辑/新增）
const App = (function () {
  const D = () => Store.getEffectiveData();
  const state = { tab: Store.getLastTab(), cal: { sel: [] }, sess: null, plan: null, lastWords: null, calMonth: null };

  // ---------- 基础 ----------
  const $ = (s) => document.querySelector(s);
  const view = () => $('#view');
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.add('hidden'), 1800);
  }
  function wkLabel(d) { return '周' + '日一二三四五六'[d.getDay()]; }
  function fmtDate(iso) { const [y, m, dd] = iso.split('-'); return m + '月' + dd + '日'; }
  function updateCartBadge() {
    const c = Store.getCart();
    const total = c.reduce((s, x) => s + x.items.length, 0);
    $('#cartCount').textContent = total;
    $('#cartFab').classList.toggle('has', total > 0);
  }

  // 长按与普通点击：普通 tap 走 onclick，长按触发 onLong
  function bindPress(el, onLong) {
    let tm = null, moved = false;
    el.addEventListener('touchstart', () => { moved = false; tm = setTimeout(() => { tm = null; onLong && onLong(); }, 600); }, { passive: true });
    el.addEventListener('touchmove', () => { moved = true; if (tm) { clearTimeout(tm); tm = null; } }, { passive: true });
    el.addEventListener('touchend', () => { if (tm) { clearTimeout(tm); tm = null; } }, { passive: true });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); moved = false; });
  }
  document.addEventListener('touchstart', (e) => { const b = e.target.closest('button,.chip,.sw,.gb-t'); if (b) b.classList.add('pressing'); }, { passive: true });
  document.addEventListener('touchend', () => { document.querySelectorAll('.pressing').forEach(x => x.classList.remove('pressing')); }, { passive: true });

  // ---------- 通用弹窗 ----------
  function showModal(title, bodyHTML, actions) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHTML;
    const acts = $('#modalActions'); acts.innerHTML = '';
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.cls || 'ghost'); b.textContent = a.text;
      b.onclick = () => { if (!a.keep) hideModal(); a.fn && a.fn(); };
      acts.appendChild(b);
    });
    $('#modalMask').classList.remove('hidden');
  }
  function hideModal() { $('#modalMask').classList.add('hidden'); }
  $('#modalMask').addEventListener('click', (e) => { if (e.target.id === 'modalMask') hideModal(); });

  // ---------- 教材详情（共用渲染） ----------
  function tableBlock(gd, t, meta) {
    const lessons = gd.tables[t] || [];
    const labels = { 识字表: '#EAF2FF', 写字表: '#E7F7EC', 词语表: '#FFF1E3' };
    const headColors = { 识字表: '#BFD7FF', 写字表: '#BCE8C6', 词语表: '#FFD9A8' };
    let html = '<div class="tbl-block"><div class="tbl-head" style="background:' + (headColors[t] || '#eee') + '">' + t + '（' + lessons.length + ' 课）</div><div class="tbl-lessons">';
    lessons.forEach((l, i) => {
      const cnt = (l.items || []).length;
      const inCart = Store.getCart().some(c => c.key === meta.key + ':' + t + ':' + i);
      html += '<div class="lesson-card' + (l.flag ? ' flag' : '') + (l.added ? ' added' : '') + '">'
        + '<div class="lc-head"><span class="lc-lesson">' + esc(l.lesson) + '</span>'
        + (l.flag ? '<span class="lc-flag">重点</span>' : '')
        + '<div class="lc-acts"><button class="lc-add" data-edit="' + esc(meta.key) + '|' + t + '|' + i + '" style="background:#8b5cf6;">编辑</button>'
        + (l.added ? '<button class="lc-add" data-deladded="' + esc(l._meta.id) + '" style="background:#ef4444;">删除</button>' : '')
        + '<button class="lc-add" data-add="' + esc(meta.key) + '|' + t + '|' + i + '">' + (inCart ? '已在单' : '加入') + '</button></div></div>'
        + '<div class="chips">' + (l.items || []).map(w => '<span class="chip">' + esc(w) + '</span>').join('') + '</div>'
        + '</div>';
    });
    if (!lessons.length) html += '<div class="empty" style="padding:16px;">本表暂无内容</div>';
    return html + '</div></div>';
  }

  function openGradeSheet(g) {
    const gd = D().grades.find(x => x.grade === g.grade && x.sem === g.sem);
    if (!gd) return;
    const meta = { key: g.grade + '|' + g.sem, grade: g.grade, sem: g.sem };
    const s = $('#sheet'); s.classList.remove('hidden');
    $('#overlay').classList.remove('hidden');
    const hasAdd = g.grade >= 1;
    s.innerHTML = '<div class="sheet-head">一年级' + (g.sem === '上' ? '上' : '下') + '册 · 三表内容<button class="x" data-close>×</button></div>'
      + '<div class="sheet-acts">' + (hasAdd ? '<button class="btn ghost" id="addLessonBtn">＋ 新增一课</button>' : '') + '</div>'
      + '<div class="tbl-sheet-body">'
      + tableBlock(gd, '识字表', meta)
      + tableBlock(gd, '写字表', meta)
      + tableBlock(gd, '词语表', meta)
      + '</div>';
    s.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
    const addBtn = s.querySelector('#addLessonBtn');
    if (addBtn) addBtn.onclick = () => openLessonEditor(meta, null, null, 'add');
    s.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addToCart(b.dataset.add, s));
    s.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const [key, t, i] = b.dataset.edit.split('|');
      const g2 = D().grades.find(x => (x.grade + '|' + x.sem) === key);
      const l = g2.tables[t][+i];
      openLessonEditor({ key, grade: g2.grade, sem: g2.sem }, t, +i, l._meta.kind, l._meta.id);
    });
    s.querySelectorAll('[data-deladded]').forEach(b => b.onclick = () => {
      showModal('删除确认', '<p style="font-size:15px;">确定删除这课新增内容吗？</p>', [
        { text: '取消', cls: 'ghost' },
        { text: '删除', cls: 'warn', fn: () => { Store.deleteLesson({ kind: 'added', id: b.dataset.deladded }); toast('已删除'); openGradeSheet(g); render(); } }
      ]);
    });
    updateCartBadge();
  }

  // ---------- 课程编辑/新增 ----------
  function openLessonEditor(meta, tableName, idx, kind, addedId) {
    let cur = { label: '', items: [] };
    if (kind === 'edit') {
      const g = D().grades.find(x => (x.grade + '|' + x.sem) === meta.key);
      const l = g.tables[tableName][idx];
      cur = { label: l.lesson, items: l.items.slice() };
    } else if (kind === 'added') {
      const c = Store.getCust(); const a = c.added.find(x => x.id === addedId);
      if (a) cur = { label: a.label, items: a.items.slice() };
    }
    showModal(kind === 'add' ? '新增一课' : '编辑「' + cur.label + '」',
      '<label class="fld">课名 / 标题<input id="edLabel" value="' + esc(cur.label) + '" placeholder="例如：课外补充 1"></label>'
      + '<label class="fld">词语（每行一个字或词）<textarea id="edItems" rows="7" placeholder="天&#10;地&#10;人">' + esc(cur.items.join('\n')) + '</textarea></label>'
      + '<p class="fld-hint">支持整行粘贴多个词（用空格、逗号、顿号分隔），保存时会自动拆分。</p>',
      [
        { text: '取消', cls: 'ghost' },
        { text: '保存', cls: 'primary', fn: () => {
          const label = $('#edLabel').value.trim() || '未命名';
          const raw = $('#edItems').value;
          const items = [];
          raw.split(/\n+/).forEach(line => {
            line.split(/[ \t,，、;；]+/).forEach(w => { w = w.trim(); if (w) items.push(w); });
          });
          if (!items.length) { toast('请至少填写一个词'); showModal(kind === 'add' ? '新增一课' : '编辑「' + label + '」', '<label class="fld">课名 / 标题<input id="edLabel" value="' + esc(label) + '"></label><label class="fld">词语<textarea id="edItems" rows="7">' + esc(raw) + '</textarea></label>', arguments); return; }
          if (kind === 'add') Store.addLesson(meta.grade, meta.sem, tableName || '识字表', label, items);
          else if (kind === 'edit') Store.editLesson({ kind: 'base', sid: D().grades.find(x => (x.grade + '|' + x.sem) === meta.key).tables[tableName][idx]._meta.sid }, label, items);
          else Store.editLesson({ kind: 'added', id: addedId }, label, items);
          toast('已保存');
          closeSheet(); openGradeSheet({ grade: meta.grade, sem: meta.sem }); render();
        } }
      ]);
  }

  // ---------- 加入购物车 ----------
  function addToCart(key, sheetEl) {
    const [gk, t, i] = key.split('|');
    const gd = D().grades.find(x => (x.grade + '|' + x.sem) === gk);
    const l = gd.tables[t][+i];
    const item = { key: gk + ':' + t + ':' + i, grade: gd.grade, sem: gd.sem, table: t, lesson: l.lesson, items: l.items.slice() };
    const added = Store.pushCart(item);
    toast(added ? '已加入听写单' : '已在听写单中（已合并）');
    updateCartBadge();
    if (sheetEl && document.body.contains(sheetEl)) {
      const b = sheetEl.querySelector('[data-add="' + CSS.escape(key) + '"]');
      if (b) { b.textContent = '已在单'; b.onclick = () => toast('已在听写单中（已合并）'); }
    }
  }

  // ---------- 购物车弹层 ----------
  function openCart() {
    const s = $('#sheet'); s.classList.remove('hidden');
    $('#overlay').classList.remove('hidden');
    const cart = Store.getCart();
    let html = '<div class="sheet-head">当前听写单（' + cart.reduce((a, x) => a + x.items.length, 0) + ' 词）<button class="x" data-close>×</button></div>';
    if (!cart.length) html += '<div class="empty">还没有加入内容<br>去「三表内容」或「自定义」里挑一课吧</div>';
    else {
      html += '<div class="cart-list">';
      cart.forEach(c => {
        html += '<div class="cart-item"><div class="ci-head">' + c.grade + '年级' + (c.sem === '上' ? '上' : '下') + '册 · ' + esc(c.table) + ' · ' + esc(c.lesson)
          + '（' + c.items.length + ' 词）<button class="x sm" data-rm="' + esc(c.key) + '" style="font-size:20px;">×</button></div>'
          + '<div class="ci-items">' + c.items.map(w => '<span class="ci-word">' + esc(w) + '</span>').join('') + '</div></div>';
      });
      html += '</div><div class="sheet-acts"><button class="btn ghost" id="cartClear">清空</button><button class="btn primary" id="cartStart">开始听写</button></div>';
    }
    s.innerHTML = html;
    s.querySelector('[data-close]').onclick = closeSheet;
    s.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { Store.removeCart(b.dataset.rm); updateCartBadge(); openCart(); render(); });
    const cc = s.querySelector('#cartClear');
    if (cc) cc.onclick = () => { Store.clearCart(); updateCartBadge(); closeSheet(); render(); toast('已清空'); };
    const cs = s.querySelector('#cartStart');
    if (cs) cs.onclick = () => { closeSheet(); startSession(buildPlanFromCart()); };
    updateCartBadge();
  }
  function closeSheet() { $('#sheet').classList.add('hidden'); $('#overlay').classList.add('hidden'); }

  // ---------- 组卷 ----------
  function buildPlanFromCart() {
    const cart = Store.getCart();
    const groups = cart.map(c => ({ source: c.table, lesson: c.lesson, grade: c.grade, sem: c.sem, items: c.items.slice() }));
    return { groups };
  }
  function buildPlanLesson(gk, t, i) {
    const gd = D().grades.find(x => (x.grade + '|' + x.sem) === gk);
    const l = gd.tables[t][+i];
    return { groups: [{ source: t, lesson: l.lesson, grade: gd.grade, sem: gd.sem, items: l.items.slice() }] };
  }
  function buildPlanRange(from, to) {
    const grades = D().grades;
    const pick = (f) => { const [g, s] = f.split('|'); return grades.findIndex(x => x.grade === +g && x.sem === s); };
    const a = pick(from), b = pick(to);
    const groups = [];
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
      const gd = grades[i];
      ['识字表', '写字表', '词语表'].forEach(t => (gd.tables[t] || []).forEach(l => {
        groups.push({ source: t, lesson: l.lesson, grade: gd.grade, sem: gd.sem, items: l.items.slice() });
      }));
    }
    return { groups };
  }
  function buildPlanWrong(list) {
    return { groups: [{ source: '错词库', lesson: '错词重练', items: list.map(x => x.w) }] };
  }

  // ---------- 听写会话 ----------
  function startSession(plan) {
    if (!plan.groups.length || !plan.groups.some(g => g.items.length)) { toast('没有可听写的词'); return; }
    state.plan = plan;
    const st = Store.getSettings();
    const sess = $('#session'); sess.classList.remove('hidden');
    renderSessionUI();
    speakIntro();
    function renderSessionUI() {
      let html = '<div class="sess-head">听写进行中 · ' + plan.groups.reduce((a, g) => a + g.items.length, 0) + ' 词<button class="x" id="sessClose">×</button></div>'
        + '<div class="sess-tip">点击下方字词标记对错（红=写错），听读按设置自动循环</div><div class="sess-list" id="sessList">';
      plan.groups.forEach((g, gi) => {
        html += '<div class="dict-group"><div class="dg-head">' + (g.grade ? g.grade + '年级' + (g.sem === '上' ? '上' : '下') + '册 · ' : '') + esc(g.source) + (g.lesson ? ' · ' + esc(g.lesson) : '') + '</div><div class="dg-items">';
        g.items.forEach((w, wi) => {
          html += '<div class="sw" data-w="' + gi + '-' + wi + '">' + esc(w) + '</div>';
        });
        html += '</div></div>';
      });
      html += '</div><div class="sess-acts"><button class="btn ghost" id="sessDone">完成</button></div>';
      sess.innerHTML = html;
      sess.querySelector('#sessClose').onclick = () => { stopSpeak(); sess.classList.add('hidden'); };
      sess.querySelectorAll('.sw').forEach(el => {
        el.onclick = () => { el.classList.toggle('wrong'); updateWrongSummary(); };
      });
      sess.querySelector('#sessDone').onclick = finishSession;
      // 自动滚动定位
      autoScroll();
    }
    function updateWrongSummary() {
      const wrongs = sess.querySelectorAll('.sw.wrong').length;
      sess.querySelector('#sessDone').textContent = wrongs ? '完成（' + wrongs + ' 个待订正）' : '完成';
    }
    function autoScroll() {
      const list = sess.querySelector('#sessList');
      const first = list.querySelector('.sw');
      if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    function speakIntro() {
      // 播报每个词，循环 reads 次
      stopSpeak();
      const seq = [];
      plan.groups.forEach((g, gi) => g.items.forEach((w, wi) => seq.push({ w, gi, wi })));
      state.sess = { seq, idx: 0, loop: 0, timer: null, stopped: false };
      step();
      function step() {
        const S = state.sess;
        if (!S || S.stopped) return;
        const st2 = Store.getSettings();
        if (S.idx >= S.seq.length) {
          S.loop++;
          if (S.loop >= st2.reads) { return; }
          S.idx = 0;
          S.timer = setTimeout(step, 2200);
          return;
        }
        const cur = S.seq[S.idx];
        speak(cur.w);
        S.timer = setTimeout(step, Math.max(1200, st2.interval * 1000));
        S.idx++;
      }
    }
  }
  function stopSpeak() { if (state.sess) { state.sess.stopped = true; if (state.sess.timer) clearTimeout(state.sess.timer); state.sess = null; } }
  function speak(text) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      const st = Store.getSettings();
      u.lang = 'zh-CN'; u.rate = st.rate; u.pitch = st.pitch;
      const vs = speechSynthesis.getVoices();
      const v = vs.find(v => v.voiceURI === st.voiceURI) || vs.find(v => v.lang && v.lang.startsWith('zh'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function finishSession() {
    const wrongs = [];
    document.querySelectorAll('#session .sw.wrong').forEach(el => {
      const [gi, wi] = el.dataset.w.split('-').map(Number);
      const w = state.plan.groups[gi].items[wi];
      wrongs.push({ w, gi, wi, g: state.plan.groups[gi] });
    });
    stopSpeak();
    // 记录历史
    const now = new Date();
    const iso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const h = Store.getHistory();
    const groups = state.plan.groups.map(g => ({
      label: (g.grade ? g.grade + '年级' + (g.sem === '上' ? '上' : '下') + '册 · ' : '') + g.source + (g.lesson ? ' · ' + g.lesson : ''),
      total: g.items.length,
      wrong: wrongs.filter(x => x.g === g).map(x => x.w)
    }));
    h.push({ date: iso, ts: now.getTime(), groups });
    Store.setHistory(h);
    // 更新错词库
    const wl = Store.getWrong();
    wrongs.forEach(x => {
      const ex = wl.find(e => e.w === x.w);
      if (ex) { ex.n++; ex.last = iso; } else wl.push({ w: x.w, n: 1, last: iso });
    });
    Store.setWrong(wl);
    $('#session').classList.add('hidden');
    state.plan = null;
    render();
    toast(wrongs.length ? '已记录，' + wrongs.length + ' 个词进入错词库' : '全部正确，真棒！');
  }

  // ---------- 三个标签页渲染 ----------
  function renderTables() {
    const grades = D().grades;
    let html = '<div class="ver-row"><div class="ver-wrap"><span class="ver">' + esc(D().version) + '</span><button class="qbtn" id="verHelp">?</button></div>'
      + '<div class="ver-acts"><button class="ver-btn" id="editData">整理</button><button class="ver-btn ghost" id="resetData">重置</button></div></div>'
      + '<p class="hint">点开册子 → 查看三表 → 长按任意一课可编辑；点「加入」把整课放进听写单。</p>';
    grades.forEach(g => {
      const total = ['识字表', '写字表', '词语表'].reduce((s, t) => s + (g.tables[t] || []).reduce((a, l) => a + l.items.length, 0), 0);
      html += '<div class="sem-row"><div class="sem-name">' + g.grade + '年级' + (g.sem === '上' ? '上' : '下') + '册 <span style="color:var(--sub);font-weight:400;font-size:13px;">共 ' + total + ' 词</span></div>'
        + '<div class="boxes"><button class="box" data-g="' + g.grade + '|' + g.sem + '"><span class="box-t">打开本册</span><span class="gb-sub">三表共 ' + total + ' 词</span></button></div></div>';
    });
    view().innerHTML = html;
    view().querySelector('#verHelp').onclick = showVersionHelp;
    view().querySelector('#editData').onclick = () => openDataModal();
    view().querySelector('#resetData').onclick = () => {
      showModal('重置确认', '<p style="font-size:15px;">将清空你对教材的全部自定义修改（编辑/删除/新增），恢复原始词库。听写历史与错词库不受影响。</p>', [
        { text: '取消', cls: 'ghost' },
        { text: '重置', cls: 'warn', fn: () => { Store.resetCust(); render(); toast('已恢复原始词库'); } }
      ]);
    };
    view().querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const [g, s] = b.dataset.g.split('|');
      openGradeSheet({ grade: +g, sem: s });
    });
  }

  function showVersionHelp() {
    showModal('词库版本', '<p class="help-p">当前词库：<b>' + esc(D().version) + '</b>（与教材页脚标注的版本一致时即可放心使用）。</p>'
      + '<p class="help-p">· 三表内容如有出入，点右上角「整理」自行修改；<br>· 「重置」恢复原始词库；<br>· 词库只存在本机，不会上传。</p>', [{ text: '知道了', cls: 'primary' }]);
  }

  function openDataModal() {
    const c = Store.getCust();
    const nEd = Object.keys(c.lessons).length, nDel = c.deleted.length, nAdd = c.added.length;
    showModal('整理词库', '<p class="help-p">你对教材的修改：<b>' + nEd + '</b> 处编辑、<b>' + nDel + '</b> 处删除、<b>' + nAdd + '</b> 课新增。</p>'
      + '<div class="data-acts">'
      + '<button class="btn ghost" id="daExport">导出修改（复制）</button>'
      + '<button class="btn ghost" id="daImport">导入修改</button>'
      + '</div>', [{ text: '关闭', cls: 'primary' }]);
    $('#daExport').onclick = () => {
      const json = JSON.stringify(Store.getCust());
      showModal('导出修改', '<p class="fld-hint">全选复制下面文本，保存到备忘录即可换机迁移：</p><textarea class="bk-area" readonly>' + esc(json) + '</textarea>', [{ text: '复制', cls: 'primary', fn: () => { navigator.clipboard && navigator.clipboard.writeText(json).then(() => toast('已复制')); } }, { text: '关闭', cls: 'ghost' }]);
    };
    $('#daImport').onclick = () => {
      showModal('导入修改', '<p class="fld-hint">粘贴之前导出的文本：</p><textarea class="bk-area" id="impArea"></textarea>', [
        { text: '取消', cls: 'ghost' },
        { text: '导入', cls: 'primary', fn: () => {
          try { const ok = Store.importCust(JSON.parse($('#impArea').value)); toast(ok ? '导入成功' : '格式不对'); if (ok) render(); } catch (e) { toast('格式不对'); }
        } }
      ]);
    };
  }

  function renderDaily() {
    const h = Store.getHistory();
    let html = '<div class="cal-bar"><button class="cal-btn" id="calBtn"><svg class="cal-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>按日期看'
      + (state.cal.sel.length ? '<span class="cal-cnt">' + state.cal.sel.length + '</span>' : '') + '</button>'
      + (state.cal.sel.length ? '<button class="cal-clear" id="calClear">清除筛选</button>' : '') + '</div>';
    let list = h;
    if (state.cal.sel.length) list = h.filter(x => state.cal.sel.includes(x.date));
    // 按日期聚合（倒序）
    const byDate = {};
    list.forEach(x => { (byDate[x.date] = byDate[x.date] || []).push(x); });
    const dates = Object.keys(byDate).sort().reverse();
    if (!dates.length) html += '<div class="empty">还没有听写记录<br>去「三表内容」挑一课开始吧</div>';
    dates.forEach(d => {
      const dObj = new Date(d + 'T00:00:00');
      const total = byDate[d].reduce((s, x) => s + x.groups.reduce((a, g) => a + g.total, 0), 0);
      html += '<div class="day"><div class="day-head" data-d="' + d + '"><span class="day-date">' + fmtDate(d) + '</span><span class="day-wk">' + wkLabel(dObj) + '</span><span class="day-cnt">' + byDate[d].length + ' 次 · ' + total + ' 词</span><span class="day-arrow">▾</span></div><div class="sess hidden" id="sessOf-' + d + '">';
      byDate[d].forEach((rec, ri) => {
        html += '<div class="sess-les"><div class="sl-head"><span>' + new Date(rec.ts).toTimeString().slice(0, 5) + '</span>' + '<button class="sess-del" data-del="' + d + '|' + rec.ts + '">删除</button></div>';
        rec.groups.forEach(g => {
          const wcnt = g.wrong.length;
          html += '<div class="sl-items">' + g.items2.map(w => '<span class="si">' + esc(w) + '</span>').join('') + '</div>';
        });
        html += '</div>';
      });
      html += '</div></div>';
    });
    html += '<div class="backup-row"><button class="backup-btn" id="bkExport">导出全部记录</button><button class="backup-btn ghost" id="bkImport">导入备份</button></div>'
      + '<p class="backup-hint">记录只存在本机浏览器；换手机前先「导出」，在新手机「导入」即可迁移。</p>';
    view().innerHTML = html;
    view().querySelector('#calBtn').onclick = openCalSheet;
    const cc = view().querySelector('#calClear');
    if (cc) cc.onclick = () => { state.cal.sel = []; renderDaily(); };
    view().querySelectorAll('.day-head').forEach(el => el.onclick = () => {
      const box = view().querySelector('#sessOf-' + el.dataset.d);
      box.classList.toggle('hidden');
      el.querySelector('.day-arrow').textContent = box.classList.contains('hidden') ? '▾' : '▴';
    });
    view().querySelectorAll('[data-del]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const [d, ts] = b.dataset.del.split('|');
      showModal('删除记录', '<p style="font-size:15px;">删除 ' + fmtDate(d) + ' 的这一次听写记录？</p>', [
        { text: '取消', cls: 'ghost' },
        { text: '删除', cls: 'warn', fn: () => {
          const h2 = Store.getHistory().filter(x => !(x.date === d && x.ts === +ts));
          Store.setHistory(h2);
          // 错词库同步撤销：重新按剩余历史汇总
          rebuildWrong();
          renderDaily(); toast('已删除');
        } }
      ]);
    });
    view().querySelector('#bkExport').onclick = () => {
      const data = JSON.stringify({ history: Store.getHistory(), wrong: Store.getWrong(), custom: Store.getCustom() });
      showModal('导出备份', '<p class="fld-hint">全选复制下面文本：</p><textarea class="bk-area" readonly>' + esc(data) + '</textarea>', [{ text: '复制', cls: 'primary', fn: () => { navigator.clipboard && navigator.clipboard.writeText(data).then(() => toast('已复制')); } }, { text: '关闭', cls: 'ghost' }]);
    };
    view().querySelector('#bkImport').onclick = () => {
      showModal('导入备份', '<p class="fld-hint">粘贴备份文本（将与现有记录合并）：</p><textarea class="bk-area" id="impBk"></textarea>', [
        { text: '取消', cls: 'ghost' },
        { text: '导入', cls: 'primary', fn: () => {
          try {
            const o = JSON.parse($('#impBk').value);
            if (o.history) {
              const h2 = Store.getHistory(); const seen = new Set(h2.map(x => x.ts));
              o.history.forEach(x => { if (!seen.has(x.ts)) h2.push(x); });
              Store.setHistory(h2);
            }
            if (o.wrong) Store.setWrong(o.wrong);
            if (o.custom) Store.setCustom(o.custom);
            toast('导入成功'); renderDaily();
          } catch (e) { toast('格式不对'); }
        } }
      ]);
    };
  }

  function rebuildWrong() {
    const wl = {};
    Store.getHistory().forEach(rec => rec.groups.forEach(g => g.wrong.forEach(w => {
      if (!wl[w]) wl[w] = { w, n: 0, last: rec.date };
      wl[w].n++; wl[w].last = rec.date;
    })));
    Store.setWrong(Object.values(wl));
  }

  function renderStats() {
    const h = Store.getHistory();
    let total = 0, wrongCnt = 0, days = new Set();
    h.forEach(x => { days.add(x.date); x.groups.forEach(g => { total += g.total; wrongCnt += g.wrong.length; }); });
    const rate = total ? Math.round((total - wrongCnt) / total * 100) : 0;
    let html = '<div class="stat-card"><div class="stat-rate">' + (total ? rate + '%' : '—') + '</div><div class="stat-sub">累计正确率 · 共听写 ' + total + ' 词 · ' + days.size + ' 天</div></div>';
    // 近 7 天正确率条形
    const byDay = {};
    h.forEach(x => { const o = byDay[x.date] = byDay[x.date] || { t: 0, w: 0 }; x.groups.forEach(g => { o.t += g.total; o.w += g.wrong.length; }); });
    const days7 = []; const now = new Date();
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); days7.push(iso); }
    html += '<div class="bars">';
    days7.forEach(d => {
      const o = byDay[d];
      const r = o && o.t ? Math.round((o.t - o.w) / o.t * 100) : 0;
      const pct = o && o.t ? r : 0;
      const color = o && o.t ? (r >= 80 ? '#10b981' : r >= 60 ? '#FFC56E' : '#F56C6C') : 'transparent';
      html += '<div class="bar-row"><span class="bar-d">' + d.slice(5) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div><span class="bar-v">' + (o && o.t ? r + '% · ' + o.t + '词' : '—') + '</span></div>';
    });
    html += '</div>';
    view().innerHTML = html;
  }

  function renderCustom() {
    const list = Store.getCustom();
    const wrong = Store.getWrong().sort((a, b) => b.n - a.n);
    let html = '<div class="cust-card"><div class="cust-head"><span class="cust-name">错词库重练</span><span class="cust-cnt">' + wrong.length + ' 词</span></div>'
      + (wrong.length ? '<div class="chips">' + wrong.slice(0, 40).map(x => '<span class="chip wrong-chip">' + esc(x.w) + '<small>×' + x.n + '</small></span>').join('') + '</div>'
        + '<div class="cust-acts"><button class="btn primary block" id="wrongGo">全部重练（' + wrong.length + ' 词）</button></div>'
        + '<p class="backup-hint">点任意错词可单独加入；错词按错误次数排序。</p>'
        : '<p class="backup-hint">还没有错词。听写时点错的词会自动进这里。</p>')
      + '</div>';
    html += '<div class="cust-card"><div class="cust-head"><span class="cust-name">我的词组</span><span class="cust-cnt">' + list.length + ' 组</span></div>';
    if (list.length) {
      html += '<div class="cart-list">';
      list.forEach(c => {
        html += '<div class="cart-item"><div class="ci-head">' + esc(c.name) + '（' + c.items.length + ' 词）<button class="x sm" data-crm="' + esc(c.id) + '" style="font-size:20px;">×</button></div>'
          + '<div class="ci-items">' + c.items.map(w => '<span class="ci-word">' + esc(w) + '</span>').join('') + '</div>'
          + '<div class="cust-acts"><button class="mini" data-cadd="' + esc(c.id) + '">加入听写单</button><button class="mini" data-cgo="' + esc(c.id) + '">直接听写</button><button class="mini" data-cedit="' + esc(c.id) + '" style="border-color:#8b5cf6;color:#8b5cf6;">编辑</button></div></div>';
      });
      html += '</div>';
    } else html += '<p class="backup-hint">把课外班的字词、古诗名句等存成词组，随时听写。</p>';
    html += '<div class="cust-acts"><button class="btn primary block" id="cNew">＋ 新建词组</button></div></div>';
    view().innerHTML = html;
    const wg = view().querySelector('#wrongGo');
    if (wg) wg.onclick = () => startSession(buildPlanWrong(Store.getWrong()));
    view().querySelectorAll('.wrong-chip').forEach(ch => ch.onclick = () => {
      const w = ch.textContent.replace(/×\d+$/, '').trim();
      startSession(buildPlanWrong([{ w, n: 1 }]));
    });
    view().querySelectorAll('[data-crm]').forEach(b => b.onclick = () => { Store.setCustom(Store.getCustom().filter(x => x.id !== b.dataset.crm)); renderCustom(); updateCartBadge(); });
    view().querySelectorAll('[data-cadd]').forEach(b => b.onclick = () => {
      const c = Store.getCustom().find(x => x.id === b.dataset.cadd);
      Store.pushCart({ key: 'custom:' + c.id, grade: 0, sem: '', table: '自定义', lesson: c.name, items: c.items.slice() });
      toast('已加入听写单'); updateCartBadge();
    });
    view().querySelectorAll('[data-cgo]').forEach(b => b.onclick = () => {
      const c = Store.getCustom().find(x => x.id === b.dataset.cgo);
      startSession({ groups: [{ source: '自定义', lesson: c.name, items: c.items.slice() }] });
    });
    view().querySelectorAll('[data-cedit]').forEach(b => b.onclick = () => openCustomEditor(Store.getCustom().find(x => x.id === b.dataset.cedit)));
    view().querySelector('#cNew').onclick = () => openCustomEditor(null);
  }

  function openCustomEditor(existing) {
    const cur = existing || { name: '', items: [] };
    showModal(existing ? '编辑词组「' + cur.name + '」' : '新建词组',
      '<label class="fld">词组名称<input id="cuName" value="' + esc(cur.name) + '" placeholder="例如：古诗 10 首句子"></label>'
      + '<label class="fld">词语（每行一个）<textarea id="cuItems" rows="7">' + esc(cur.items.join('\n')) + '</textarea></label>',
      [
        { text: '取消', cls: 'ghost' },
        { text: '保存', cls: 'primary', fn: () => {
          const name = $('#cuName').value.trim() || '未命名';
          const items = [];
          $('#cuItems').value.split(/\n+/).forEach(line => line.split(/[ \t,，、;；]+/).forEach(w => { w = w.trim(); if (w) items.push(w); }));
          if (!items.length) { toast('请至少填写一个词'); return; }
          const list = Store.getCustom();
          if (existing) { const c = list.find(x => x.id === existing.id); c.name = name; c.items = items; }
          else list.push({ id: 'cu_' + Date.now(), name, items });
          Store.setCustom(list);
          toast('已保存'); renderCustom();
        } }
      ]);
  }

  // ---------- 日历弹层 ----------
  function openCalSheet() {
    const h = Store.getHistory();
    const withData = [...new Set(h.map(x => x.date))];
    if (!state.calMonth) { const n = new Date(); state.calMonth = { y: n.getFullYear(), m: n.getMonth() }; }
    const s = $('#calSheet'); s.classList.remove('hidden'); $('#calOverlay').classList.remove('hidden');
    draw();
    function draw() {
      const { y, m } = state.calMonth;
      const first = new Date(y, m, 1);
      const startWk = first.getDay();
      const dim = new Date(y, m + 1, 0).getDate();
      const todayIso = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
      let html = '<div class="sheet-head">选择日期<button class="x" data-close>×</button></div>'
        + '<div class="cal-nav"><button class="cal-nav-btn" id="calPrev">‹</button><span class="cal-mtitle">' + y + '年' + (m + 1) + '月</span><button class="cal-nav-btn" id="calNext">›</button></div><div class="cal-grid">';
      '日一二三四五六'.split('').forEach(w => html += '<div class="cal-wk">' + w + '</div>');
      for (let i = 0; i < startWk; i++) html += '<div class="cal-cell empty"></div>';
      for (let d = 1; d <= dim; d++) {
        const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const on = state.cal.sel.includes(iso);
        const has = withData.includes(iso);
        html += '<div class="cal-cell' + (on ? ' on' : '') + (iso === todayIso ? ' today' : '') + '" data-cd="' + iso + '" style="' + (has ? '' : 'color:#c3cad0;') + '">' + d + '</div>';
      }
      html += '</div><div class="cal-foot"><span class="cal-info">已选 ' + state.cal.sel.length + ' 天</span>'
        + '<button class="cal-clear2" id="calWipe">清空选择</button></div>'
        + '<div class="sheet-acts"><button class="btn ghost" id="calCancel">取消</button><button class="btn primary" id="calOk">确定</button></div>';
      s.innerHTML = html;
      s.querySelector('[data-close]').onclick = closeCal;
      s.querySelector('#calPrev').onclick = () => { let { y, m } = state.calMonth; m--; if (m < 0) { m = 11; y--; } state.calMonth = { y, m }; draw(); };
      s.querySelector('#calNext').onclick = () => { let { y, m } = state.calMonth; m++; if (m > 11) { m = 0; y++; } state.calMonth = { y, m }; draw(); };
      s.querySelectorAll('[data-cd]').forEach(c => c.onclick = () => {
        const iso = c.dataset.cd;
        const i = state.cal.sel.indexOf(iso);
        if (i >= 0) state.cal.sel.splice(i, 1); else state.cal.sel.push(iso);
        draw();
      });
      s.querySelector('#calWipe').onclick = () => { state.cal.sel = []; draw(); };
      s.querySelector('#calCancel').onclick = closeCal;
      s.querySelector('#calOk').onclick = () => { closeCal(); renderDaily(); };
    }
    function closeCal() { s.classList.add('hidden'); $('#calOverlay').classList.add('hidden'); }
  }

  // ---------- 设置 ----------
  function openSettings() {
    const st = Store.getSettings();
    showModal('听写设置',
      '<label class="fld">每个词连读 <input id="stReads" type="number" min="1" max="6" value="' + st.reads + '" style="width:60px;"> 遍</label>'
      + '<label class="fld">词间隔 <input id="stInt" type="number" min="1" max="10" step="0.5" value="' + st.interval + '" style="width:60px;"> 秒</label>'
      + '<label class="fld">语速 <input id="stRate" type="number" min="0.5" max="1.5" step="0.1" value="' + st.rate + '" style="width:60px;"> （0.9 慢速适合低年级）</label>'
      + '<label class="fld">音调 <input id="stPitch" type="number" min="0.5" max="2" step="0.05" value="' + st.pitch + '" style="width:60px;"></label>'
      + '<label class="fld">发音声音<select id="stVoice" style="width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1px solid #cbd5e1;font-size:15px;">'
      + '<option value="">默认（系统中文）</option>'
      + speechSynthesis.getVoices().filter(v => v.lang && v.lang.startsWith('zh')).map(v => '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === st.voiceURI ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('')
      + '</select></label>',
      [
        { text: '取消', cls: 'ghost' },
        { text: '保存', cls: 'primary', fn: () => {
          Store.setSettings({
            reads: Math.max(1, +$('#stReads').value || 2),
            interval: Math.max(1, +$('#stInt').value || 1.5),
            rate: +$('#stRate').value || 0.9,
            pitch: +$('#stPitch').value || 1.15,
            voiceURI: $('#stVoice').value,
            ttsSource: 'local'
          });
          toast('已保存');
        } }
      ]);
  }

  // ---------- 主渲染 ----------
  function render() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === state.tab));
    Store.setLastTab(state.tab);
    if (state.tab === 'tables') renderTables();
    else if (state.tab === 'daily') renderDaily();
    else if (state.tab === 'stats') renderStats();
    else renderCustom();
    updateCartBadge();
  }

  // ---------- 事件绑定 ----------
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { state.tab = t.dataset.tab; render(); });
  $('#cartFab').onclick = openCart;
  $('#overlay').onclick = closeSheet;
  $('#calOverlay').onclick = () => { $('#calSheet').classList.add('hidden'); $('#calOverlay').classList.add('hidden'); };
  $('#cartFab').addEventListener('contextmenu', (e) => { e.preventDefault(); openSettings(); });
  let fabLong = null;
  $('#cartFab').addEventListener('touchstart', () => { fabLong = setTimeout(openSettings, 600); }, { passive: true });
  $('#cartFab').addEventListener('touchend', () => { clearTimeout(fabLong); }, { passive: true });
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideModal(); closeSheet(); } });

  // 启动
  render();
  if (speechSynthesis) speechSynthesis.getVoices(); // 预热声音列表
  return { render };
})();
