(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const nf = new Intl.NumberFormat('zh-CN');
  const RARITY = { prismatic: '棱彩', gold: '黄金', silver: '白银' };
  const CROSS_LABEL = { agree: '双源一致', close: '基本一致', diverge: '存在分歧', single: '单源' };
  const CONF_LABEL = { A: '高', B: '中', C: '低' };

  // 英文英雄 ID -> 常用外号/称号/拼音。用于搜索与“成型思路”的亲切称呼。
  const HERO_ALIASES = {
    LeeSin: ['盲僧', '瞎子', '李青', 'leesin', 'lishen'],
    Ryze: ['瑞天帝', '瑞兹', '光头', '雷电法王', 'ruizi'],
    Yasuo: ['亚索', '疾风剑豪', '快乐风男', 'yasuo'],
    Yone: ['永恩', '封魔剑魂', 'yone'],
    TwistedFate: ['卡牌', '卡牌大师', '崔斯特', 'twistedfate', 'kaipai'],
    Graves: ['男枪', '格雷福斯', 'graves'],
    MissFortune: ['女枪', '赏金猎人', '厄运小姐', 'missfortune'],
    Lucian: ['奥巴马', '卢锡安', '圣枪游侠', 'lucian'],
    Sett: ['腕豪', '瑟提', '劲夫', 'sett'],
    Darius: ['诺手', '诺克萨斯之手', '达里厄斯', 'darius'],
    Garen: ['盖伦', '德玛', 'garen'],
    Teemo: ['提莫', '蘑菇', 'teemo'],
    Veigar: ['小法', '维迦', 'veigar'],
    Vayne: ['薇恩', 'vn', 'vayne'],
    KaiSa: ['卡莎', 'kaisa'],
    Ezreal: ['ez', '伊泽瑞尔', 'ezreal'],
    Jhin: ['烬', '戏命师', 'jhin'],
    Caitlyn: ['女警', '凯特琳', 'caitlyn'],
    Jinx: ['金克丝', 'jinx'],
    Thresh: ['锤石', '魂锁典狱长', 'thresh'],
    Blitzcrank: ['机器人', '布里茨', 'blitzcrank'],
    Malphite: ['石头人', '墨菲特', 'malphite'],
    Amumu: ['木木', '阿木木', 'amumu'],
    Sion: ['赛恩', '老司机', '亡灵战神', 'sion'],
    Mordekaiser: ['铁男', '莫德凯撒', 'mordekaiser'],
    Aatrox: ['剑魔', '亚托克斯', 'aatrox'],
    Riven: ['锐雯', '放逐之刃', 'riven'],
    Fiora: ['剑姬', '菲奥娜', 'fiora'],
    Irelia: ['刀妹', '艾瑞莉娅', 'irelia'],
    Akali: ['阿卡丽', 'akali'],
    Zed: ['劫', 'zed'],
    Katarina: ['卡特', '卡特琳娜', 'katarina'],
    Talon: ['男刀', '泰隆', 'talon'],
    Rengar: ['狮子狗', '雷恩加尔', 'rengar'],
    KhaZix: ['螳螂', '卡兹克', 'khazix'],
    MasterYi: ['剑圣', '易大师', 'masteryi'],
    Tryndamere: ['蛮王', '泰达米尔', 'tryndamere'],
    Jax: ['武器大师', '贾克斯', 'jax'],
    Nasus: ['狗头', '内瑟斯', 'nasus'],
    Renekton: ['鳄鱼', '雷克顿', 'renekton'],
    DrMundo: ['蒙多', 'dr mundo', 'drmundo'],
    Singed: ['炼金', '辛吉德', 'singed'],
    Karthus: ['死歌', '卡尔萨斯', 'karthus'],
    KogMaw: ['大嘴', '克格莫', 'kogmaw'],
    Smolder: ['小火龙', '斯莫德', 'smolder'],
    Aurora: ['兔子', '阿萝拉', 'aurora'],
    Ambessa: ['安蓓萨', 'ambessa'],
    Sona: ['琴女', '娑娜', 'sona'],
    Soraka: ['奶妈', '索拉卡', 'soraka'],
    Lulu: ['璐璐', 'lulu'],
    Janna: ['风女', '迦娜', 'janna'],
    Nami: ['娜美', 'nami'],
    Yuumi: ['猫咪', '悠米', 'yuumi'],
    Seraphine: ['芬妮', '萨勒芬妮', 'seraphine'],
    Senna: ['赛娜', 'senna'],
    Pyke: ['派克', 'pyke'],
    Rakan: ['洛', 'rakan'],
    Xayah: ['霞', 'xayah'],
    Ksante: ['奎桑提', 'ksante'],
    Briar: ['贝蕾亚', 'briar'],
    Hwei: ['彗', 'hwei'],
    Naafiri: ['纳亚菲利', 'naafiri'],
    Belveth: ['卑尔维斯', 'belveth'],
    Milio: ['米利欧', 'milio'],
    Gwen: ['格温', 'gwen'],
    Viego: ['佛耶戈', '破败王', 'viego']
  };

  function normSearch(value) {
    return String(value == null ? '' : value).toLowerCase()
      .replace(/[\s'’.,，。·_\-]/g, '');
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 1) return 9;
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let last = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        last = tmp;
      }
    }
    return prev[b.length];
  }

  function matchSearch(tokens, query, allowFuzzy) {
    const q = normSearch(query);
    if (!q) return true;
    const list = (tokens || []).map(normSearch).filter(Boolean);
    if (list.some(t => t.indexOf(q) !== -1 || q.indexOf(t) !== -1)) return true;
    if (allowFuzzy !== false && q.length >= 2) {
      return list.some(t => editDistance(t, q) <= 1);
    }
    return false;
  }

  function heroSearchTokens(h) {
    const extra = HERO_ALIASES[h.key] || [];
    return [h.name, h.title, h.key].concat(extra);
  }

  function heroNickname(h) {
    const extra = HERO_ALIASES[h.key] || [];
    return extra[0] || h.title || h.name;
  }

  const isWeb = location.protocol === 'http:' || location.protocol === 'https:';
  const isLocal = isWeb && (location.hostname === '127.0.0.1' || location.hostname === 'localhost' || location.hostname === '::1');
  const state = {
    data: null,
    served: isWeb,
    local: isLocal,
    cloud: isWeb && !isLocal,
    mode: 'aram',
    board: 'heroes',
    search: '',
    rarity: 'all',
    sort: 'rank',
    arenaBoard: 'champions',
    arenaSearch: '',
    arenaRarity: 'all',
    arenaSort: 'place',
    status: null,
    lastStatusAt: '',
    config: null,
    refreshing: false,
    aramItemIndex: null,
    arenaItemIndex: null
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(v) {
    const n = Number(v || 0);
    return nf.format(Math.round(n));
  }

  function pct(v, digits) {
    const n = Number(v || 0);
    return n.toFixed(digits == null ? 2 : digits) + '%';
  }

  function signed(v) {
    const n = Number(v || 0);
    return (n > 0 ? '+' : '') + n.toFixed(2);
  }

  function parseDate(value) {
    if (!value) return null;
    const s = String(value).trim();
    // 兼容 "2026-11-14 23:52:51 +08:00" 这类带空格时区的格式
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
    }
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtTime(value) {
    const d = parseDate(value);
    if (!d) return '—';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return mm + '-' + dd + ' ' + hh + ':' + mi;
  }

  function fmtDate(value) {
    const d = parseDate(value);
    if (!d) return '—';
    const y = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + mm + '-' + dd;
  }

  function toast(message, isError) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3600);
  }

  function setLive(kind, text) {
    const dot = $('#statusDot');
    dot.className = 'dot' + (kind === 'ok' ? '' : ' ' + kind);
    $('#statusText').textContent = text;
  }

  // ---------- 数据加载 ----------
  async function loadSnapshot(silent) {
    let data = null;
    const embedded = new URLSearchParams(location.search).has('embedded');
    if (state.served && !embedded) {
      // 优先读取静态快照：本地服务和云端静态托管都能用同一套逻辑。
      try {
        const res = await fetch('data/snapshot.json?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) data = await res.json();
      } catch (err) {
        if (!silent) console.warn('static snapshot fetch failed', err);
      }
      // 兼容只提供 API 的本地服务。
      if (!data && state.local) {
        try {
          const res = await fetch('api/snapshot?t=' + Date.now(), { cache: 'no-store' });
          if (res.ok) data = await res.json();
        } catch (err) {
          if (!silent) console.warn('snapshot api fetch failed', err);
        }
      }
    }
    if (!data && window.__SNAPSHOT__) data = window.__SNAPSHOT__;
    if (!data) {
      setLive('error', '数据载入失败');
      toast('没有读到数据，请检查 data/snapshot.json 是否已生成', true);
      return;
    }
    const changed = !state.data || state.data.generatedAt !== data.generatedAt;
    state.data = data;
    state.lastGeneratedAt = data.generatedAt || '';
    state.aramItemIndex = null;
    state.arenaItemIndex = null;
    if (state.cloud) setLive('ok', '自动更新 · ' + fmtTime(data.generatedAt));
    renderAll();
    if (silent && changed) toast('已同步最新数据 · ' + fmtTime(data.generatedAt));
  }

  async function loadConfig() {
    if (!state.local) return;
    try {
      const res = await fetch('api/config', { cache: 'no-store' });
      if (res.ok) state.config = await res.json();
    } catch (_) { }
    renderFooter();
  }

  async function pollStatus(force) {
    if (!state.local) return;
    let st = null;
    try {
      const res = await fetch('api/status?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) st = await res.json();
    } catch (_) { }
    if (!st) {
      if (force) setLive('offline', '本地服务未连接');
      return;
    }
    const prev = state.status;
    state.status = st;
    state.refreshing = st.state === 'running';

    if (st.state === 'running') {
      setLive('busy', '正在刷新数据…');
      $('#refreshBtn').disabled = true;
      $('#refreshBtn').innerHTML = '<span class="btn-ico spin">⟳</span> 刷新中…';
    } else if (st.state === 'error') {
      setLive('error', '上次刷新失败');
      $('#refreshBtn').disabled = false;
      $('#refreshBtn').innerHTML = '<span class="btn-ico">⟳</span> 刷新数据';
      if (force) toast(st.error || '刷新失败，请查看 logs/refresh.log', true);
    } else {
      setLive('ok', '数据已就绪');
      $('#refreshBtn').disabled = false;
      $('#refreshBtn').innerHTML = '<span class="btn-ico">⟳</span> 刷新数据';
    }

    const first = !state.lastStatusAt;
    if (first) {
      state.lastStatusAt = st.updatedAt || '';
    } else if (st.updatedAt && st.updatedAt !== state.lastStatusAt) {
      state.lastStatusAt = st.updatedAt;
      if (st.state === 'ok' && (!prev || prev.state === 'running')) {
        await loadSnapshot(true);
        toast('数据已更新到最新版本');
      }
    }
  }

  async function triggerRefresh() {
    if (!state.local) {
      toast('云端版的数据由服务器定时自动更新，无需手动刷新。', true);
      return;
    }
    if (state.refreshing) {
      toast('刷新正在进行中，请稍候');
      return;
    }
    const btn = $('#refreshBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-ico spin">⟳</span> 正在启动…';
    try {
      const res = await fetch('api/refresh', { method: 'POST' });
      if (res.status === 409) {
        toast('已有刷新任务在运行');
      } else if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      } else {
        toast('已开始刷新，完成后页面会自动更新');
      }
      setLive('busy', '正在刷新数据…');
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-ico spin">⟳</span> 刷新中…';
      // 等刷新脚本写入 running 状态后再同步，避免按钮被旧的 ok 状态提前解锁
      setTimeout(() => pollStatus(true), 1200);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-ico">⟳</span> 刷新数据';
      setLive('error', '无法启动刷新');
      toast('无法启动刷新：' + err.message, true);
    }
  }

  // ---------- 渲染 ----------
  function renderAll() {
    if (!state.data) return;
    renderMeta();
    if (state.mode === 'arena') {
      renderArenaStats();
      renderArenaBoard();
    } else {
      renderStats();
      renderBoard();
      renderCombos();
    }
    renderAudit();
    renderFooter();
  }

  function renderMeta() {
    if (state.mode === 'arena') {
      const am = state.data.arena && state.data.arena.meta;
      if (!am) {
        $('#metaStrip').innerHTML = '<span class="meta-pill">斗魂数据尚未生成，点击“刷新数据”重试</span>';
        return;
      }
      $('#metaStrip').innerHTML = [
        '<span class="meta-pill gold">版本 <b>Patch ' + esc(am.patch) + '</b></span>',
        '<span class="meta-pill">数据日期 <b>' + esc(fmtDate(am.dataDate)) + '</b></span>',
        '<span class="meta-pill">统计窗口 <b>' + esc(am.window || '近 2–3 周') + '</b></span>',
        '<span class="meta-pill">更新于 <b>' + esc(fmtTime(state.data.generatedAt)) + '</b></span>',
        '<span class="meta-pill">样本 <b>' + num(am.sampleMatches) + ' 场</b></span>',
        '<span class="meta-pill">口径 <b>全球服 · 8 人乱斗</b></span>'
      ].join('');
      return;
    }
    const m = state.data.aram && state.data.aram.meta;
    if (!m) return;
    const start = fmtDate(m.windowStart);
    const end = fmtDate(m.snapshotAt || m.dataDate);
    const pills = [
      '<span class="meta-pill gold">版本 <b>Patch ' + esc(m.patch) + '</b></span>',
      '<span class="meta-pill">数据日期 <b>' + esc(fmtDate(m.dataDate)) + '</b></span>',
      '<span class="meta-pill">统计窗口 <b>' + esc(start) + ' → ' + esc(end) + '</b></span>',
      '<span class="meta-pill">更新于 <b>' + esc(fmtTime(state.data.generatedAt)) + '</b></span>',
      '<span class="meta-pill">样本 <b>' + num(m.validMatches) + ' 场</b></span>',
      '<span class="meta-pill">口径 <b>全体玩家 · 国服 7 区</b></span>'
    ];
    $('#metaStrip').innerHTML = pills.join('');
  }

  function renderStats() {
    const m = state.data.aram.meta;
    const a = state.data.aram;
    const d1 = parseDate(m.windowStart);
    const d2 = parseDate(m.snapshotAt || m.dataDate);
    let days = '—';
    if (d1 && d2) days = ((d2 - d1) / 86400000).toFixed(1) + ' 天';
    const cards = [
      { label: '有效对局', value: num(m.validMatches), unit: '场', note: '已排除 ' + num(m.collectedMatches - m.validMatches) + ' 场异常/重复' },
      { label: '英雄出场', value: num(m.heroParticipations), unit: '人次', note: '10 名英雄 × 每场对局' },
      { label: '覆盖英雄', value: num(m.heroCount), unit: '位', note: '同时收录 ' + num(m.augmentCount) + ' 个海克斯' },
      { label: '数据窗口', value: days.replace(' 天', ''), unit: '天', note: fmtDate(m.windowStart) + ' → ' + fmtDate(m.snapshotAt || m.dataDate) }
    ];
    $('#statGrid').innerHTML = cards.map(c =>
      '<div class="stat"><div class="stat-label">' + esc(c.label) + '</div>' +
      '<div class="stat-value">' + esc(c.value) + '<small>' + esc(c.unit) + '</small></div>' +
      '<div class="stat-note">' + esc(c.note) + '</div></div>'
    ).join('');
  }

  function renderArenaStats() {
    const a = state.data && state.data.arena;
    if (!a || !a.meta) {
      $('#arenaStatGrid').innerHTML = '<div class="stat"><div class="stat-label">斗魂数据</div><div class="stat-value">待生成</div><div class="stat-note">运行刷新脚本后会显示</div></div>';
      return;
    }
    const m = a.meta;
    const cards = [
      { label: '有效对局', value: num(m.sampleMatches), unit: '场', note: '近 2–3 周滚动样本' },
      { label: '英雄出场', value: num(m.samplePicks), unit: '人次', note: '8 名英雄 × 每场对局' },
      { label: '覆盖英雄', value: num(m.championCount), unit: '位', note: '同时收录 ' + num(m.augmentCount) + ' 个海克斯' },
      { label: '出装覆盖', value: num(m.buildCoverage), unit: '套', note: '强度榜前 ' + num(m.buildTopN) + ' 名英雄' }
    ];
    $('#arenaStatGrid').innerHTML = cards.map(c =>
      '<div class="stat"><div class="stat-label">' + esc(c.label) + '</div>' +
      '<div class="stat-value">' + esc(c.value) + '<small>' + esc(c.unit) + '</small></div>' +
      '<div class="stat-note">' + esc(c.note) + '</div></div>'
    ).join('');
  }

  function arenaCrossHtml(row) {
    if (!row.lumRank) {
      return '<span class="cross single" title="lum.gg 只公布前 50 名，该英雄未进入其榜单，无法做排序核对"><span class="cross-dot"></span>单源</span>';
    }
    const status = row.crossStatus || 'single';
    const label = status === 'agree' ? '一致' : status === 'close' ? '接近' : status === 'diverge' ? '分歧' : '单源';
    const diff = Math.abs(Number(row.rankDiff || 0));
    const tip = 'lum.gg 强度排序第 ' + row.lumRank + ' 名；与 ggez 第 ' + row.rank + ' 名相差 ' + diff + ' 位';
    return '<span class="cross ' + esc(status) + '" title="' + esc(tip) + '"><span class="cross-dot"></span>lum #' + row.lumRank + ' · ' + label + '</span>';
  }

  function arenaChampionRow(c, i) {
    return '<tr data-arena-hero="' + esc(c.key) + '">' +
      '<td class="col-rank"><span class="' + (i < 3 ? 'rank-top' : '') + '">' + (i + 1) + '</span></td>' +
      '<td><div class="cell-champ">' +
        '<img class="avatar" loading="lazy" src="' + esc(c.icon) + '" alt="' + esc(c.name) + '" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="champ-name">' + esc(c.name) + '</div><div class="champ-title">' + esc(c.key) + '</div></div>' +
      '</div></td>' +
      '<td><span class="tier tier-' + esc(c.tier) + '">' + esc(c.tier) + '</span></td>' +
      '<td class="num"><span class="wr' + (c.wr >= 55 ? ' wr-high' : '') + '">' + pct(c.wr, 1) + '</span></td>' +
      '<td class="num"><span class="place">' + Number(c.place || 0).toFixed(2) + '</span></td>' +
      '<td class="num col-first">' + pct(c.first, 1) + '</td>' +
      '<td class="num col-pick">' + pct(c.pick, 1) + '</td>' +
      '<td class="num col-games">' + num(c.games) + '</td>' +
      '<td>' + confHtml(c.confidence) + '</td>' +
      '<td>' + arenaCrossHtml(c) + '</td>' +
    '</tr>';
  }

  function arenaAugRow(a, i) {
    const icon = a.icon
      ? '<img class="aug-img" loading="lazy" src="' + esc(a.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'">'
      : '<span class="aug-rune rarity-' + esc(a.rarity) + '">◆</span>';
    return '<tr data-arena-aug="' + esc(a.name) + '">' +
      '<td class="col-rank"><span class="' + (i < 3 ? 'rank-top' : '') + '">' + (i + 1) + '</span></td>' +
      '<td><div class="cell-champ"' + tipAttr(arenaAugTip(a)) + '>' + icon +
        '<div><div class="aug-name">' + esc(a.name) + '</div><div class="champ-title">' + esc(a.tier) + ' 级 · 斗魂海克斯</div></div>' +
      '</div></td>' +
      '<td><span class="rarity rarity-' + esc(a.rarity) + '">' + esc(a.rarity) + '</span></td>' +
      '<td class="num"><span class="wr' + (a.top3 >= 60 ? ' wr-high' : '') + '">' + pct(a.top3, 1) + '</span></td>' +
      '<td class="num"><span class="place">' + Number(a.place || 0).toFixed(2) + '</span></td>' +
      '<td class="num col-first">' + pct(a.first, 1) + '</td>' +
      '<td class="num col-pick">' + pct(a.share, 1) + '</td>' +
      '<td class="num col-games">' + num(a.picks) + '</td>' +
      '<td>' + confHtml(a.confidence) + '</td>' +
    '</tr>';
  }

  function arenaCurrentRows() {
    if (!state.data || !state.data.arena) return [];
    const isHero = state.arenaBoard === 'champions';
    let rows = (isHero ? state.data.arena.champions : state.data.arena.augments).slice();
    const q = state.arenaSearch.trim().toLowerCase();
    if (q) {
      const test = (r, fuzzy) => {
        if (isHero) return matchSearch(heroSearchTokens(r), q, fuzzy);
        const info = state.data.arena.augmentInfo && state.data.arena.augmentInfo[r.name];
        const eff = info ? effectBlocks(info.effect).join(' ') : '';
        return matchSearch([r.name, r.rarity, eff], q, fuzzy);
      };
      const exact = rows.filter(r => test(r, false));
      rows = exact.length ? exact : rows.filter(r => test(r, true));
    }
    if (!isHero && state.arenaRarity !== 'all') {
      rows = rows.filter(r => r.rarity === state.arenaRarity);
    }
    const key = state.arenaSort;
    rows.sort((a, b) => {
      if (key === 'place') return Number(a.place || 99) - Number(b.place || 99);
      if (key === 'rank') return Number(a.rank || 999) - Number(b.rank || 999);
      return Number(b[key] || 0) - Number(a[key] || 0);
    });
    return rows;
  }

  function renderArenaBoard() {
    const a = state.data && state.data.arena;
    if (!a) return;
    const isHero = state.arenaBoard === 'champions';
    $('#arenaChampionTable').hidden = !isHero;
    $('#arenaAugmentTable').hidden = isHero;
    $('#arenaRarityFilters').hidden = isHero;
    $('#arenaBoardSub').textContent = isHero
      ? '默认按平均名次排序（越低越好）；点击任意一行查看推荐强化与成装。'
      : '前三率 = 进入前三的比例；海克斯没有第二个数值来源，因此只标注样本信心。';
    $$('#arenaSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.arenaBoard === state.arenaBoard));

    const heroSort = [
      ['place', '平均名次 ↑（越低越好）'], ['wr', '前二率 ↓'], ['first', '第一名率 ↓'],
      ['pick', '选取率 ↓'], ['games', '场次 ↓'], ['rank', '默认排名']
    ];
    const augSort = [
      ['place', '平均名次 ↑（越低越好）'], ['top3', '前三率 ↓'], ['first', '第一名率 ↓'],
      ['share', '选取率 ↓'], ['picks', '选取场次 ↓'], ['rank', '默认排名']
    ];
    const options = isHero ? heroSort : augSort;
    if (!options.some(o => o[0] === state.arenaSort)) state.arenaSort = 'place';
    $('#arenaSortSelect').innerHTML = options.map(o =>
      '<option value="' + o[0] + '"' + (state.arenaSort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'
    ).join('');

    const rows = arenaCurrentRows();
    const tbody = isHero ? $('#arenaChampionTable tbody') : $('#arenaAugmentTable tbody');
    tbody.innerHTML = rows.length
      ? rows.map(isHero ? arenaChampionRow : arenaAugRow).join('')
      : '<tr class="empty-row"><td colspan="' + (isHero ? 10 : 9) + '">没有匹配的条目，换个关键词试试</td></tr>';

    const total = isHero ? a.champions.length : a.augments.length;
    $('#arenaTableFoot').innerHTML =
      '<span>显示 ' + rows.length + ' / ' + total + ' 条</span>' +
      '<span>' + (isHero
        ? '前二率即“胜率”口径；平均名次越低越好。排序校验来自 lum.gg 强度榜（仅公布前 50 名）。'
        : '前三率与平均名次来自 ggez.gg；稀有度与样本信心用于判断稳定性。') + '</span>';
  }

  function crossHtml(row) {
    const status = row.crossStatus || 'single';
    const label = CROSS_LABEL[status] || '单源';
    let detail = '';
    if (Array.isArray(row.cross) && row.cross.length) {
      detail = row.cross.map(c => c.src + ' ' + pct(c.wr, 1) + '（' + (c.delta > 0 ? '+' : '') + Number(c.delta).toFixed(2) + 'pp）').join('；');
    }
    return '<span class="cross ' + esc(status) + '" title="' + esc(detail || '暂无第二来源') + '">' +
      '<span class="cross-dot"></span>' + esc(label) + '</span>';
  }

  function confHtml(level) {
    const lv = CONF_LABEL[level] ? level : 'C';
    return '<span class="conf conf-' + lv + '"><b>' + lv + '</b>' + CONF_LABEL[lv] + '</span>';
  }

  // ---------- 悬浮数值 ----------
  function stampFor(mode) {
    const m = mode === 'arena'
      ? (state.data.arena && state.data.arena.meta)
      : (state.data.aram && state.data.aram.meta);
    if (!m) return '';
    return 'Patch ' + (m.patch || '—') + ' · 数据 ' + fmtDate(m.dataDate) + ' · 更新 ' + fmtTime(state.data.generatedAt);
  }

  function effectBlocks(effect) {
    if (!effect) return [];
    if (typeof effect === 'string') return effect.split(/\n+/).filter(Boolean);
    return (effect || []).map(x => typeof x === 'string' ? x : x.text).filter(Boolean);
  }

  function effectTipHtml(effect, limit) {
    const blocks = effectBlocks(effect);
    if (!blocks.length) return '';
    return '<div class="tip-effect">' + esc(blocks.slice(0, limit || 2).join('\n')) + '</div>';
  }

  function attrText(line) {
    const m = String(line || '').match(/^([\d.]+%?)\s*(.*)$/);
    return m ? '<b>' + esc(m[1]) + '</b> ' + esc(m[2]) : esc(line);
  }

  function attrRowsHtml(stats) {
    const rows = (stats || []).filter(Boolean);
    if (!rows.length) return '';
    return '<div class="tip-attrs">' + rows.map(s => '<div class="tip-attr">' + attrText(s) + '</div>').join('') + '</div>';
  }

  function statLineHtml(text) {
    return text ? '<div class="tip-stat-line">' + esc(text) + '</div>' : '';
  }

  function statListHtml(stats) {
    const rows = (stats || []).filter(Boolean);
    if (!rows.length) return '<p class="d-note">暂无属性数据。</p>';
    return '<div class="stat-list">' + rows.map(s => '<div class="stat-row">' + attrText(s) + '</div>').join('') + '</div>';
  }

  function effectListHtml(effects) {
    const blocks = effectBlocks(effects);
    if (!blocks.length) return '<p class="d-note">暂无效果文本。</p>';
    return '<div class="effect-block">' + blocks.map(t => {
      const isTitle = t.length <= 14 && !/[。；，、]/.test(t);
      return '<p' + (isTitle ? ' class="effect-title"' : '') + '>' + esc(t) + '</p>';
    }).join('') + '</div>';
  }

  function tipCard(title, subtitle, sections, footer) {
    return '<div class="tip-title">' + esc(title) + '</div>' +
      (subtitle ? '<div class="tip-sub">' + esc(subtitle) + '</div>' : '') +
      (sections || []).filter(Boolean).join('') +
      (footer ? '<div class="tip-foot">' + esc(footer) + '</div>' : '');
  }

  function tipAttr(html) {
    return ' data-tip="' + esc(html) + '"';
  }

  function aramAugTip(a, heroName) {
    const aram = state.data && state.data.aram;
    if (!aram) return '';
    const full = aram.augments.find(x => String(x.id) === String(a.id)) || a;
    const info = aram.augmentInfo && aram.augmentInfo[String(full.id)];
    const stat = heroName
      ? '该英雄胜率 ' + pct(a.wr) + ' · 相对 ' + signed(a.delta) + ' pp'
      : '胜率 ' + pct(full.wr) + ' · 相对 ' + signed(full.delta) + ' pp · 选取 ' + pct(full.pick);
    return tipCard(
      full.name,
      (RARITY[full.rarity] || full.rarity) + '海克斯' + (heroName ? ' · ' + heroName : ''),
      [effectTipHtml(info && info.effect, 3), statLineHtml(stat)],
      stampFor('aram')
    );
  }

  function arenaAugTip(a, championName) {
    const arena = state.data && state.data.arena;
    if (!arena) return '';
    const full = arena.augments.find(x => String(x.name) === String(a.name)) || a;
    const info = arena.augmentInfo && arena.augmentInfo[String(full.name)];
    const stat = championName
      ? '该英雄前三 ' + pct(a.top3, 1) + ' · 选取 ' + pct(a.pick, 1)
      : '前三 ' + pct(full.top3, 1) + ' · 均名 ' + Number(full.place || 0).toFixed(2) + ' · 选取 ' + pct(full.share, 1);
    const srcNote = info && String(info.source || '').indexOf('ARAMKit') === 0 ? ' · 海斗文本' : '';
    return tipCard(
      full.name,
      (full.rarity || '') + '海克斯' + (championName ? ' · ' + championName : '') + srcNote,
      [effectTipHtml(info && info.effect, 3), statLineHtml(stat)],
      stampFor('arena')
    );
  }

  function getAramItemIndex() {
    if (state.aramItemIndex) return state.aramItemIndex;
    const aram = state.data && state.data.aram;
    if (!aram) return new Map();
    const heroMap = new Map((aram.heroes || []).map(h => [String(h.id), h]));
    const map = new Map();
    Object.keys(aram.builds || {}).forEach(hid => {
      const hero = heroMap.get(String(hid));
      ((aram.builds[hid] && aram.builds[hid].items) || []).forEach(it => {
        const key = String(it.id);
        let entry = map.get(key);
        if (!entry) {
          entry = { id: it.id, name: it.name, icon: it.icon, totalGames: 0, totalWins: 0, heroes: [] };
          map.set(key, entry);
        }
        const games = Number(it.games || 0);
        entry.totalGames += games;
        entry.totalWins += games * Number(it.wr || 0) / 100;
        entry.heroes.push({
          id: hero ? hero.id : hid,
          name: hero ? hero.name : String(hid),
          icon: hero ? hero.icon : '',
          tier: hero ? hero.tier : '',
          wr: Number(it.wr || 0),
          pick: Number(it.pick || 0),
          games: games
        });
      });
    });
    map.forEach(entry => { entry.wr = entry.totalGames ? entry.totalWins / entry.totalGames * 100 : 0; });
    state.aramItemIndex = map;
    return map;
  }

  function getArenaItemIndex() {
    if (state.arenaItemIndex) return state.arenaItemIndex;
    const arena = state.data && state.data.arena;
    if (!arena) return new Map();
    const champMap = new Map((arena.champions || []).map(c => [String(c.key), c]));
    const map = new Map();
    Object.keys(arena.builds || {}).forEach(key => {
      const champ = champMap.get(String(key));
      ((arena.builds[key] && arena.builds[key].items) || []).forEach(it => {
        const id = String(it.itemId || it.name);
        let entry = map.get(id);
        if (!entry) {
          entry = { id: id, name: it.name, icon: it.icon, appearances: [] };
          map.set(id, entry);
        }
        entry.appearances.push({
          key: key,
          name: champ ? champ.name : key,
          icon: champ ? champ.icon : '',
          top3: Number(it.top3 || 0),
          pick: Number(it.pick || 0)
        });
      });
    });
    state.arenaItemIndex = map;
    return map;
  }

  function aramItemTip(it, heroId, comboWr) {
    const aram = state.data && state.data.aram;
    if (!aram) return '';
    const entry = getAramItemIndex().get(String(it.id));
    const info = aram.itemInfo && aram.itemInfo[String(it.id)];
    const heroItem = heroId && aram.builds[String(heroId)]
      ? (aram.builds[String(heroId)].items || []).find(x => String(x.id) === String(it.id))
      : null;
    const bits = [];
    if (comboWr != null) bits.push('组合内 ' + pct(comboWr, 1));
    if (heroItem) bits.push('该英雄胜率 ' + pct(heroItem.wr) + ' · 携带率 ' + pct(heroItem.pick, 1));
    else if (entry) bits.push('全榜加权 ' + pct(entry.wr));
    return tipCard(
      (info && info.name) || it.name,
      '海斗成装' + (info && info.price ? ' · ' + num(info.price) + ' 金币' : '') + ' · 点击查看',
      [attrRowsHtml(info && info.stats), effectTipHtml(info && info.effects, 2), statLineHtml(bits.join(' · '))],
      stampFor('aram')
    );
  }

  function arenaItemTip(it, championKey) {
    const arena = state.data && state.data.arena;
    if (!arena) return '';
    const info = arena.itemInfo && arena.itemInfo[String(it.itemId || it.name)];
    const champ = (arena.champions || []).find(c => String(c.key) === String(championKey));
    const bits = [];
    if (it.top3 != null) bits.push('该英雄前三 ' + pct(it.top3, 1) + ' · 选取 ' + pct(it.pick, 1));
    return tipCard(
      (info && info.name) || it.name,
      '斗魂成装' + (info && info.price ? ' · ' + num(info.price) + ' 金币' : '') + (champ ? ' · ' + champ.name : '') + ' · 点击查看',
      [attrRowsHtml(info && info.stats), effectTipHtml(info && info.effects, 2), statLineHtml(bits.join(' · '))],
      stampFor('arena')
    );
  }

  function heroRow(h) {
    return '<tr data-hero="' + h.id + '">' +
      '<td class="col-rank"><span class="' + (h.rank <= 3 ? 'rank-top' : '') + '">' + h.rank + '</span></td>' +
      '<td><div class="cell-champ">' +
        '<img class="avatar" loading="lazy" src="' + esc(h.icon) + '" alt="' + esc(h.name) + '" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="champ-name">' + esc(h.name) + '</div><div class="champ-title">' + esc(h.title || '') + '</div></div>' +
      '</div></td>' +
      '<td><span class="tier tier-' + esc(h.tier) + '">' + esc(h.tier) + '</span></td>' +
      '<td class="num"><span class="wr' + (h.wr >= 55 ? ' wr-high' : '') + '">' + pct(h.wr) + '</span></td>' +
      '<td class="num col-pick">' + pct(h.pick) + '</td>' +
      '<td class="num col-games">' + num(h.games) + '</td>' +
      '<td>' + confHtml(h.confidence) + '</td>' +
      '<td>' + crossHtml(h) + '</td>' +
    '</tr>';
  }

  function augRow(a) {
    return '<tr data-aug="' + a.id + '">' +
      '<td class="col-rank"><span class="' + (a.rank <= 3 ? 'rank-top' : '') + '">' + a.rank + '</span></td>' +
      '<td><div class="cell-champ"' + tipAttr(aramAugTip(a)) + '>' +
        '<span class="aug-rune rarity-' + esc(a.rarity) + '">◆</span>' +
        '<div><div class="aug-name">' + esc(a.name) + '</div><div class="champ-title">海克斯 · ' + esc(RARITY[a.rarity] || a.rarity) + '</div></div>' +
      '</div></td>' +
      '<td><span class="rarity rarity-' + esc(a.rarity) + '">' + esc(RARITY[a.rarity] || a.rarity) + '</span></td>' +
      '<td class="num"><span class="wr">' + pct(a.wr) + '</span></td>' +
      '<td class="num"><span class="' + (a.delta >= 0 ? 'delta-up' : 'delta-down') + '">' + signed(a.delta) + '<span class="sub-num"> pp</span></span></td>' +
      '<td class="num col-pick">' + pct(a.pick) + '</td>' +
      '<td class="num col-games">' + num(a.games) + '</td>' +
      '<td>' + confHtml(a.confidence) + '</td>' +
      '<td>' + crossHtml(a) + '</td>' +
    '</tr>';
  }

  function currentRows() {
    if (!state.data || !state.data.aram) return [];
    const isHero = state.board === 'heroes';
    let rows = isHero ? state.data.aram.heroes.slice() : state.data.aram.augments.slice();
    const q = state.search.trim().toLowerCase();
    if (q) {
      const test = (r, fuzzy) => {
        if (isHero) return matchSearch(heroSearchTokens(r), q, fuzzy);
        const info = state.data.aram.augmentInfo && state.data.aram.augmentInfo[String(r.id)];
        const eff = info ? effectBlocks(info.effect).join(' ') : '';
        return matchSearch([r.name, RARITY[r.rarity] || r.rarity, eff], q, fuzzy);
      };
      const exact = rows.filter(r => test(r, false));
      rows = exact.length ? exact : rows.filter(r => test(r, true));
    }
    if (!isHero && state.rarity !== 'all') {
      rows = rows.filter(r => r.rarity === state.rarity);
    }
    const key = state.sort;
    rows.sort((a, b) => {
      if (key === 'rank') return a.rank - b.rank;
      return Number(b[key] || 0) - Number(a[key] || 0);
    });
    return rows;
  }

  function renderBoard() {
    if (!state.data || !state.data.aram) return;
    const isHero = state.board === 'heroes';
    $('#heroTable').hidden = !isHero;
    $('#augTable').hidden = isHero;
    $('#rarityFilters').hidden = isHero;
    $('#boardSub').textContent = isHero
      ? '按全体玩家对局统计，点击任意一行查看高胜率出装与最佳海克斯搭配。'
      : '“相对提升”已按英雄基线校正，点击任意一行查看最适合该海克斯的英雄。';

    const heroSort = [
      ['rank', '默认排名'], ['wr', '胜率 ↓'], ['pick', '选取率 ↓'], ['games', '场次 ↓']
    ];
    const augSort = [
      ['rank', '默认排名'], ['wr', '胜率 ↓'], ['delta', '相对提升 ↓'], ['pick', '选取率 ↓'], ['games', '场次 ↓']
    ];
    const options = isHero ? heroSort : augSort;
    if (!options.some(o => o[0] === state.sort)) state.sort = 'rank';
    $('#sortSelect').innerHTML = options.map(o =>
      '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'
    ).join('');

    const rows = currentRows();
    const tbody = isHero ? $('#heroTable tbody') : $('#augTable tbody');
    tbody.innerHTML = rows.length
      ? rows.map(isHero ? heroRow : augRow).join('')
      : '<tr class="empty-row"><td colspan="' + (isHero ? 8 : 9) + '">没有匹配的条目，换个关键词试试</td></tr>';

    const total = isHero ? state.data.aram.heroes.length : state.data.aram.augments.length;
    $('#tableFoot').innerHTML =
      '<span>显示 ' + rows.length + ' / ' + total + ' 条</span>' +
      '<span>' + (isHero ? '胜率按英雄出场对局计算，选取率为每队每位置的出现率' : '相对提升 = 海克斯使用者胜率 − 同英雄平均胜率，已按出场量加权') + '</span>';
  }

  function renderCombos() {
    const panel = $('#comboPanel');
    const aram = state.data && state.data.aram;
    const combos = (aram && aram.combos) || [];
    if (!panel) return;
    if (!combos.length) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const meta = aram.comboMeta || {};
    const rarityClass = r => (RARITY[r] ? ' rarity-' + r : '');
    const augHtml = a => {
      const tag = a.id ? 'button' : 'span';
      const attrs = a.id
        ? ' type="button" data-aug="' + esc(a.id) + '" aria-label="查看 ' + esc(a.name) + ' 详情"'
        : '';
      return '<' + tag + ' class="combo-aug"' + attrs + tipAttr(aramAugTip(a)) + '>' +
        '<img loading="lazy" src="' + esc(a.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="combo-aug-name">' + esc(a.name) + '</span>' +
        '<span class="rarity' + rarityClass(a.rarity) + '">' + esc(RARITY[a.rarity] || a.rarity || '海克斯') + '</span>' +
        '</' + tag + '>';
    };
    $('#comboGrid').innerHTML = combos.map(c =>
      '<article class="combo-card">' +
        '<span class="combo-rank">' + String(c.rank).padStart(2, '0') + '</span>' +
        '<div class="combo-pair">' + augHtml(c.a) + '<span class="combo-plus">+</span>' + augHtml(c.b) + '</div>' +
        '<div class="combo-metrics">' +
          '<div class="combo-main"><b>' + pct(c.wr, 1) + '</b><span>组合胜率</span></div>' +
          '<div class="combo-delta"><b>' + signed(c.delta) + '<small> pp</small></b><span>相对基准</span></div>' +
          '<div class="combo-base"><b>' + pct(c.baseline, 1) + '</b><span>基准胜率</span></div>' +
        '</div>' +
      '</article>'
    ).join('');
    $('#comboSource').textContent = 'ARAMKit · 单源';
    $('#comboSource').title = meta.note || '';
    $('#comboFoot').innerHTML =
      '<span>共 ' + combos.length + ' 组 · Patch ' + esc(meta.patch || '—') + ' · 数据日期 ' + esc(meta.dataDate || '—') +
      (meta.sampleMatches ? ' · 基于 ' + num(meta.sampleMatches) + ' 场' : '') + '</span>' +
      '<span>真实联合样本，非单卡胜率相加 · 单源且未公开逐组场次，组合属稀有事件，仅供参考</span>';
  }

  function renderAudit() {
    const audit = state.data.audit;
    if (!audit) return;
    const sources = audit.sources || [];
    $('#sourceList').innerHTML = sources.map(s => {
      const roleClass = (s.role && s.role.indexOf('交叉') >= 0) ? ' cross-role' : '';
      return '<div class="source">' +
        '<div class="source-name">' + esc(s.name) + '</div>' +
        '<div class="source-role' + roleClass + '">' + esc(s.role || '来源') + '</div>' +
        '<div class="source-meta">Patch ' + esc(s.patch || '—') + ' · ' + esc(s.date || '—') + ' · ' + esc(s.sample || '') + '</div>' +
        (s.note ? '<div class="source-note">' + esc(s.note) + '</div>' : '') +
      '</div>';
    }).join('');

    $('#excludedList').innerHTML = (audit.excluded || []).map(e =>
      '<div class="excluded"><b>' + esc(e.name) + '</b>' + esc(e.reason) + '</div>'
    ).join('');

    const conf = audit.confidence || {};
    const order = ['A', 'B', 'C', 'single'];
    $('#confidenceLegend').innerHTML = order.filter(k => conf[k]).map(k => {
      const label = k === 'single' ? '单源' : (CONF_LABEL[k] || k);
      return '<div><b>' + esc(label) + '</b>：' + esc(conf[k]) + '</div>';
    }).join('');

    const lic = state.mode === 'arena'
      ? (state.data.arena && state.data.arena.meta ? state.data.arena.meta.license : '')
      : (state.data.aram && state.data.aram.meta ? state.data.aram.meta.license : '');
    if (lic) $('#licenseTag').textContent = lic;
  }

  function renderFooter() {
    const minutes = state.config && state.config.refreshMinutes;
    let mode;
    if (state.local) {
      mode = '本地服务 · ' + (minutes ? '每 ' + minutes + ' 分钟自动刷新' : '自动刷新已开启');
    } else if (state.cloud) {
      mode = '云端托管 · 数据定时自动更新';
    } else {
      mode = '静态打开 · 无法自动刷新';
    }
    const gen = state.data ? ' · 数据更新于 ' + fmtTime(state.data.generatedAt) : '';
    $('#footerMeta').textContent = mode + gen;
    const src = state.mode === 'arena'
      ? '斗魂数据：<a href="https://ggez.gg/zh/tierlist/arena" target="_blank" rel="noopener">ggez.gg</a>（Riot Games API） · 交叉校验：<a href="https://lum.gg/zh-cn/lol/arena" target="_blank" rel="noopener">lum.gg</a>（仅排序）'
      : '数据主源：<a href="https://github.com/czgreat/aramhex-data" target="_blank" rel="noopener">AramHex</a>（CC BY-NC 4.0） · 交叉校验：ARAMKit、Hexdata';
    const srcEl = $('#footerSources');
    if (srcEl) srcEl.innerHTML = src;
  }

  // ---------- 详情抽屉 ----------
  function openDrawer(html) {
    $('#drawerBody').innerHTML = html;
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#drawerBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#drawer').scrollTop = 0;
  }

  function setHash(kind, id, extra) {
    try {
      history.replaceState(null, '', location.pathname + location.search + '#' + kind + '=' + encodeURIComponent(id) + (extra ? '&' + extra : ''));
    } catch (_) { }
  }

  function clearHash() {
    if (/^#(hero|aug|item|arena-hero|arena-aug|arena-item)=/.test(location.hash)) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { }
    }
  }

  function handleHash() {
    const m = location.hash.match(/^#(arena-hero|arena-aug|arena-item|hero|aug|item)=([^&]+)(?:&hero=([^&]+))?$/);
    if (!m) return;
    const id = decodeURIComponent(m[2]);
    const heroCtx = m[3] ? decodeURIComponent(m[3]) : '';
    if (m[1] === 'arena-hero') { setMode('arena', false); openArenaChampion(id); }
    else if (m[1] === 'arena-aug') { setMode('arena', false); openArenaAugment(id); }
    else if (m[1] === 'arena-item') { setMode('arena', false); openArenaItem(id, heroCtx); }
    else if (m[1] === 'hero') openHero(id);
    else if (m[1] === 'item') openItem(id, heroCtx);
    else openAugment(id);
  }

  function closeDrawer() {
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#drawerBackdrop').hidden = true;
    document.body.style.overflow = '';
    clearHash();
  }

  function crossTable(mainWr, cross) {
    let rows = '<tr><th>来源</th><th>胜率</th><th>偏差</th></tr>' +
      '<tr><td>主源 AramHex</td><td>' + pct(mainWr) + '</td><td>—</td></tr>';
    (cross || []).forEach(c => {
      const d = Number(c.delta || 0);
      rows += '<tr><td>' + esc(c.src) + '</td><td>' + pct(c.wr) + '</td><td>' +
        (d > 0 ? '+' : '') + d.toFixed(2) + ' pp</td></tr>';
    });
    if (!cross || !cross.length) {
      rows += '<tr><td colspan="3" style="color:var(--text-3)">暂无第二来源可比对</td></tr>';
    }
    return '<table class="cross-table">' + rows + '</table>';
  }

  function openHero(id) {
    if (!state.data || !state.data.aram) return;
    const aram = state.data.aram;
    const h = aram.heroes.find(x => String(x.id) === String(id));
    if (!h) return;
    const b = aram.builds[String(id)] || { items: [], augments: [], combos: [] };
    const augList = (b.augments || []).slice().sort((a, c) => Number(c.delta || 0) - Number(a.delta || 0));
    const itemList = (b.items || []).slice().sort((a, c) => Number(c.wr || 0) - Number(a.wr || 0));
    const bestAug = augList[0] || null;
    const bestItem = itemList[0] || null;
    const bestAugInfo = bestAug && aram.augmentInfo ? aram.augmentInfo[String(bestAug.id)] : null;
    const bestAugEffect = bestAugInfo ? (effectBlocks(bestAugInfo.effect)[0] || '') : '';

    const topAugIds = new Set(augList.slice(0, 6).map(a => String(a.id)));
    const duos = (aram.combos || []).filter(c =>
      topAugIds.has(String(c.a.id)) || topAugIds.has(String(c.b.id))
    ).slice(0, 4);
    const bestDuo = bestAug ? duos.find(c => String(c.a.id) === String(bestAug.id) || String(c.b.id) === String(bestAug.id)) : null;

    const core = [];
    if (bestAug) {
      core.push('优先抢 <b>' + esc(bestAug.name) + '</b>：该英雄胜率 <b>' + pct(bestAug.wr) + '</b>，相对提升 <b>' + signed(bestAug.delta) + ' pp</b>。');
    }
    if (bestItem) {
      core.push('成装优先 <b>' + esc(bestItem.name) + '</b>：该英雄胜率 <b>' + pct(bestItem.wr) + '</b>。');
    }
    if (bestDuo) {
      const other = String(bestDuo.a.id) === String(bestAug.id) ? bestDuo.b : bestDuo.a;
      core.push('若同时拿到「' + esc(other.name) + '」，双海克斯联合样本胜率 <b>' + pct(bestDuo.wr, 1) + '</b>（全英雄样本，非该英雄专属）。');
    }
    const heroTip = (bestAug || bestItem)
      ? '<div class="hero-tip">' +
          '<div class="hero-tip-kicker">版本成型思路 · 根据本版本高胜率样本自动生成</div>' +
          '<h3>「' + esc(heroNickname(h)) + '」成型核心</h3>' +
          '<p>' + core.join(' ') + '</p>' +
          (bestAugEffect ? '<p class="hero-tip-effect">' + esc(bestAugEffect) + '</p>' : '') +
        '</div>'
      : '';

    const items = itemList.map(it =>
      '<div class="item item-click" data-item="' + esc(it.id) + '" data-item-hero="' + esc(h.id) + '"' + tipAttr(aramItemTip(it, h.id)) + '>' +
      '<img loading="lazy" src="' + esc(it.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<div><div class="item-name">' + esc(it.name) + '</div>' +
      '<div class="item-meta">胜率 ' + pct(it.wr) + ' · 携带率 ' + pct(it.pick, 1) + '</div></div></div>'
    ).join('') || '<p class="d-note">该英雄暂无足够样本的出装数据。</p>';

    const augs = augList.map(a =>
      '<div class="aug-row" data-aug="' + a.id + '"' + tipAttr(aramAugTip(a, h.name)) + '>' +
        '<span class="aug-rune rarity-' + esc(a.rarity) + '">◆</span>' +
        '<div class="aug-row-main"><div class="aug-row-name">' + esc(a.name) + '</div>' +
        '<div class="aug-row-meta">' + esc(RARITY[a.rarity] || a.rarity) + ' · 胜率 ' + pct(a.wr) + ' · ' + num(a.games) + ' 场</div></div>' +
        '<div class="aug-row-val"><b>' + signed(a.delta) + 'pp</b><span>相对提升</span></div>' +
      '</div>'
    ).join('') || '<p class="d-note">该英雄暂无足够样本的海克斯数据。</p>';

    const comboCards = (b.combos || []).slice(0, 6).map((c, i) => {
      const its = (c.items || []).map(it =>
        '<span class="combo-item" data-item="' + esc(it.id) + '" data-item-hero="' + esc(h.id) + '"' + tipAttr(aramItemTip(it, h.id, it.wr)) + '>' +
        '<img loading="lazy" src="' + esc(it.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        esc(it.name) + ' <b>' + pct(it.wr, 1) + '</b></span>'
      ).join('');
      return '<article class="synergy-card">' +
        '<div class="synergy-head"><span class="synergy-rank">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<button type="button" class="synergy-aug" data-aug="' + esc(c.augmentId) + '">' + esc(c.augment) + '</button>' +
          '<span class="rarity rarity-' + esc(c.rarity) + '">' + esc(RARITY[c.rarity] || c.rarity) + '</span></div>' +
        '<div class="combo-items">' + its + '</div>' +
        '<div class="synergy-foot">真实联合样本 · ' + num(c.games) + ' 场</div>' +
      '</article>';
    }).join('') || '<p class="d-note">暂无海克斯 × 出装组合数据。</p>';

    const duoCards = duos.map(c =>
      '<div class="duo-card">' +
        '<div class="duo-pair"><button type="button" data-aug="' + esc(c.a.id) + '">' + esc(c.a.name) + '</button>' +
        '<span>+</span><button type="button" data-aug="' + esc(c.b.id) + '">' + esc(c.b.name) + '</button></div>' +
        '<div class="duo-metric"><b>' + pct(c.wr, 1) + '</b><span>组合胜率 · ' + signed(c.delta) + ' pp</span></div>' +
      '</div>'
    ).join('');

    openDrawer(
      '<div class="d-head">' +
        '<img class="d-avatar" src="' + esc(h.icon) + '" alt="' + esc(h.name) + '" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="d-name">' + esc(h.name) + '</div><div class="d-title">' + esc(h.title || '') + '</div>' +
        '<div class="d-tags"><span class="tier tier-' + esc(h.tier) + '">' + esc(h.tier) + '</span>' +
        '<span class="conf conf-' + esc(h.confidence) + '"><b>' + esc(h.confidence) + '</b>' + (CONF_LABEL[h.confidence] || '') + '</span>' +
        crossHtml(h) + '<span class="meta-pill">排名 #' + h.rank + '</span></div></div>' +
      '</div>' +
      '<div class="d-stats">' +
        '<div class="d-stat"><span>胜率</span><b>' + pct(h.wr) + '</b></div>' +
        '<div class="d-stat"><span>选取率</span><b>' + pct(h.pick) + '</b></div>' +
      '</div>' +
      '<div class="secondary-stats">出场 ' + num(h.games) + ' 场 · 多源一致性见文末（次要）</div>' +
      heroTip +
      '<div class="d-section combo-first"><h3>高胜率海克斯 × 出装组合</h3>' +
        '<p class="d-note">同一海克斯与具体成装同时出现时的真实联合样本，按组合内成装胜率排序。</p>' +
        '<div class="synergy-grid">' + comboCards + '</div></div>' +
      (duoCards ? '<div class="d-section"><h3>双海克斯协同</h3><p class="d-note">该英雄强势海克斯出现在全英雄双海克斯组合榜中的样本；非该英雄专属数据。</p><div class="duo-grid">' + duoCards + '</div></div>' : '') +
      '<div class="d-section"><h3>高胜率成装</h3><p class="d-note">仅统计已完成装备；携带率 = 该装备出现次数 / 该英雄出场数。</p><div class="item-grid">' + items + '</div></div>' +
      '<div class="d-section"><h3>最佳海克斯</h3><p class="d-note">按相对提升排序；括号内为相对该英雄平均胜率的提升。</p>' + augs + '</div>' +
      '<details class="more-details"><summary>多源校验（次要）</summary>' + crossTable(h.wr, h.cross) + '</details>'
    );
    setHash('hero', id);
  }

  function openAugment(id) {
    if (!state.data || !state.data.aram) return;
    const a = state.data.aram.augments.find(x => String(x.id) === String(id));
    if (!a) return;
    const info = state.data.aram.augmentInfo && state.data.aram.augmentInfo[String(id)];
    const heroes = state.data.aram.augmentHeroes[String(id)] || [];
    const heroHtml = heroes.map(h =>
      '<div class="hero-mini" data-hero="' + h.id + '">' +
        '<img loading="lazy" src="' + esc(h.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="hm-name">' + esc(h.name) + '</div><div class="hm-meta">胜率 ' + pct(h.wr) + ' · ' + num(h.games) + ' 场</div></div>' +
        '<div class="hm-delta">' + signed(h.delta) + '</div>' +
      '</div>'
    ).join('') || '<p class="d-note">暂无足够样本的英雄明细。</p>';

    openDrawer(
      '<div class="d-head">' +
        '<span class="aug-rune rarity-' + esc(a.rarity) + '" style="width:64px;height:64px;font-size:30px;border-radius:12px">◆</span>' +
        '<div><div class="d-name">' + esc(a.name) + '</div>' +
        '<div class="d-title">' + esc(RARITY[a.rarity] || a.rarity) + '海克斯 · 排名 #' + a.rank + '</div>' +
        '<div class="d-tags"><span class="tier tier-' + esc(a.tier) + '">' + esc(a.tier) + '</span>' +
        '<span class="rarity rarity-' + esc(a.rarity) + '">' + esc(RARITY[a.rarity] || a.rarity) + '</span>' +
        '<span class="conf conf-' + esc(a.confidence) + '"><b>' + esc(a.confidence) + '</b>' + (CONF_LABEL[a.confidence] || '') + '</span>' +
        crossHtml(a) + '</div></div>' +
      '</div>' +
      '<div class="d-section game-data effect-first"><h3>海克斯效果</h3>' + effectListHtml(info && info.effect) + '</div>' +
      '<div class="d-stats">' +
        '<div class="d-stat"><span>胜率</span><b>' + pct(a.wr) + '</b></div>' +
        '<div class="d-stat"><span>相对提升</span><b class="' + (a.delta >= 0 ? 'delta-up' : 'delta-down') + '">' + signed(a.delta) + ' pp</b></div>' +
        '<div class="d-stat"><span>选取率</span><b>' + pct(a.pick) + '</b></div>' +
      '</div>' +
      '<div class="d-section"><h3>最适合的英雄</h3><p class="d-note">按“该英雄拿到此海克斯后的相对提升”排序，点击可查看该英雄出装。</p><div class="hero-grid">' + heroHtml + '</div></div>' +
      '<details class="more-details"><summary>统计口径与多源校验（次要）</summary><p class="d-note">原始胜率 ' + pct(a.wr) + '；扣除英雄本身强度后，相对提升为 ' + signed(a.delta) + ' 个百分点，样本 ' + num(a.games) + ' 场。</p>' + crossTable(a.wr, a.cross) + '</details>'
    );
    setHash('aug', id);
  }

  function openItem(id, heroId) {
    const aram = state.data && state.data.aram;
    if (!aram) return;
    const entry = getAramItemIndex().get(String(id));
    if (!entry) return;
    const info = aram.itemInfo && aram.itemInfo[String(id)];
    const hero = heroId ? aram.heroes.find(x => String(x.id) === String(heroId)) : null;
    const heroItem = hero && aram.builds[String(hero.id)]
      ? (aram.builds[String(hero.id)].items || []).find(x => String(x.id) === String(id))
      : null;
    const name = (info && info.name) || entry.name;
    const icon = entry.icon || (info && info.icon) || '';
    const statBits = [];
    if (heroItem) statBits.push('该英雄胜率 ' + pct(heroItem.wr) + ' · 携带率 ' + pct(heroItem.pick, 1));
    statBits.push('全榜加权胜率 ' + pct(entry.wr));
    const topHeroes = entry.heroes.slice().sort((a, b) => b.games - a.games).slice(0, 8).map(x =>
      '<div class="hero-mini" data-hero="' + esc(x.id) + '">' +
        '<img loading="lazy" src="' + esc(x.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="hm-name">' + esc(x.name) + '</div><div class="hm-meta">胜率 ' + pct(x.wr) + ' · 携带率 ' + pct(x.pick, 1) + '</div></div>' +
        '<div class="hm-delta">' + pct(x.pick, 1) + '</div>' +
      '</div>'
    ).join('');
    const priceLine = info
      ? '<div class="price-line">总价 ' + num(info.price) + ' 金币' + (info.sell ? ' · 出售 ' + num(info.sell) + ' 金币' : '') + '</div>'
      : '';
    openDrawer(
      '<div class="d-head">' +
        '<img class="d-avatar" src="' + esc(icon) + '" alt="' + esc(name) + '" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="d-name">' + esc(name) + '</div>' +
        '<div class="d-title">海克斯大乱斗 · 成装' + (hero ? ' · ' + esc(hero.name) : '') + '</div>' +
        '<div class="d-tags"><span class="rarity">装备</span><span class="meta-pill">ID ' + esc(entry.id) + '</span></div></div>' +
      '</div>' +
      '<div class="d-section game-data"><h3>装备属性</h3>' + statListHtml(info && info.stats) + priceLine + '</div>' +
      '<div class="d-section game-data"><h3>被动与效果</h3>' + effectListHtml(info && info.effects) + '</div>' +
      '<div class="secondary-stats">' + esc(statBits.join(' · ')) + '</div>' +
      '<details class="more-details"><summary>相关英雄（次要）</summary><p class="d-note">按携带场次排序；右侧为携带率。</p><div class="hero-grid">' + topHeroes + '</div></details>' +
      '<p class="d-note source-note">属性与效果来自 ARAMKit 游戏资源；胜率来自推荐出装统计，仅代表相关性。</p>'
    );
    setHash('item', id, hero ? 'hero=' + encodeURIComponent(hero.id) : '');
  }

  function openArenaItem(id, championKey) {
    const arena = state.data && state.data.arena;
    if (!arena) return;
    const entry = getArenaItemIndex().get(String(id));
    if (!entry) return;
    const info = arena.itemInfo && arena.itemInfo[String(id)];
    const champ = (arena.champions || []).find(c => String(c.key) === String(championKey));
    const current = entry.appearances.find(x => String(x.key) === String(championKey));
    const name = (info && info.name) || entry.name;
    const icon = entry.icon || (info && info.icon) || '';
    const bits = [];
    if (current) bits.push('该英雄前三 ' + pct(current.top3, 1) + ' · 选取 ' + pct(current.pick, 1));
    const list = entry.appearances.slice().sort((a, b) => b.top3 - a.top3).map(x =>
      '<div class="hero-mini" data-arena-hero="' + esc(x.key) + '">' +
        '<img loading="lazy" src="' + esc(x.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="hm-name">' + esc(x.name) + '</div><div class="hm-meta">前三 ' + pct(x.top3, 1) + ' · 选取 ' + pct(x.pick, 1) + '</div></div>' +
        '<div class="hm-delta">' + pct(x.top3, 1) + '</div>' +
      '</div>'
    ).join('');
    const priceLine = info
      ? '<div class="price-line">总价 ' + num(info.price) + ' 金币</div>'
      : '';
    openDrawer(
      '<div class="d-head">' +
        '<img class="d-avatar" src="' + esc(icon) + '" alt="' + esc(name) + '" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="d-name">' + esc(name) + '</div>' +
        '<div class="d-title">斗魂竞技场 · 推荐成装' + (champ ? ' · ' + esc(champ.name) : '') + '</div>' +
        '<div class="d-tags"><span class="rarity">装备</span></div></div>' +
      '</div>' +
      '<div class="d-section game-data"><h3>装备属性</h3>' + statListHtml(info && info.stats) + priceLine + '</div>' +
      '<div class="d-section game-data"><h3>被动与效果</h3>' + effectListHtml(info && info.effects) + '</div>' +
      '<div class="secondary-stats">' + esc(bits.join(' · ') || '暂无当前英雄样本') + '</div>' +
      '<details class="more-details"><summary>使用该装备的英雄（次要）</summary><p class="d-note">按前三率排序，点击可查看英雄详情。</p><div class="hero-grid">' + list + '</div></details>' +
      '<p class="d-note source-note">属性与效果来自 Data Dragon；斗魂只提供推荐出装前三率/选取率，无装备原始胜率。部分装备伤害数值由对局动态计算，Data Dragon 显示为 0 的已省略。</p>'
    );
    setHash('arena-item', id, champ ? 'hero=' + encodeURIComponent(champ.key) : '');
  }

  function buildChip(x, showRarity, championKey, championName) {
    const icon = x.icon
      ? '<img loading="lazy" src="' + esc(x.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'">'
      : '<span class="chip-ph">◆</span>';
    const rare = showRarity && x.rarity ? '<span class="build-rar rarity-' + esc(x.rarity) + '">' + esc(x.rarity) + '</span>' : '';
    const attrs = showRarity
      ? ' data-arena-aug="' + esc(x.name) + '"'
      : ' data-arena-item="' + esc(x.itemId || x.name) + '" data-arena-champion="' + esc(championKey) + '"';
    const tip = showRarity ? arenaAugTip(x, championName) : arenaItemTip(x, championKey);
    return '<div class="build-chip build-click" role="button" tabindex="0"' + attrs + tipAttr(tip) + '>' + icon +
      '<div class="build-chip-main"><div class="build-chip-name">' + esc(x.name) + rare + '</div>' +
      '<div class="build-chip-meta">前三 <b>' + pct(x.top3, 1) + '</b> · 选取 ' + pct(x.pick, 1) + '</div></div></div>';
  }

  function openArenaChampion(key) {
    const a = state.data && state.data.arena;
    if (!a) return;
    const c = a.champions.find(x => String(x.key) === String(key));
    if (!c) return;
    const b = a.builds[String(key)] || null;
    const augList = b && b.augments ? b.augments.slice().sort((x, y) => Number(y.top3 || 0) - Number(x.top3 || 0)) : [];
    const itemList = b && b.items ? b.items.slice().sort((x, y) => Number(y.top3 || 0) - Number(x.top3 || 0)) : [];
    const topAug = augList[0] || null;
    const topItem = itemList[0] || null;
    const augHtml = augList.length
      ? '<div class="build-grid">' + augList.map(x => buildChip(x, true, c.key, c.name)).join('') + '</div>'
      : '<p class="d-note">该英雄暂未收录推荐强化。当前只抓取强度榜前 30 名英雄的推荐出装。</p>';
    const itemHtml = itemList.length
      ? '<div class="build-grid">' + itemList.map(x => buildChip(x, false, c.key, c.name)).join('') + '</div>'
      : '<p class="d-note">该英雄暂未收录推荐成装。当前只抓取强度榜前 30 名英雄的推荐出装。</p>';
    const cross = c.lumRank
      ? '<table class="cross-table"><tr><th>来源</th><th>强度排名</th><th>与主源差</th></tr>' +
        '<tr><td>ggez.gg（主源）</td><td>#' + c.rank + '</td><td>—</td></tr>' +
        '<tr><td>lum.gg（仅排序）</td><td>#' + c.lumRank + '</td><td>' + (c.rankDiff > 0 ? '+' : '') + c.rankDiff + ' 位</td></tr></table>'
      : '<p class="d-note">lum.gg 只公布前 50 名，该英雄未进入其榜单，因此无法做第二来源排序核对。</p>';

    const tipBits = [];
    if (topAug) tipBits.push('强化优先 <b>' + esc(topAug.name) + '</b>（前三 <b>' + pct(topAug.top3, 1) + '</b>）。');
    if (topItem) tipBits.push('成装优先 <b>' + esc(topItem.name) + '</b>（前三 <b>' + pct(topItem.top3, 1) + '</b>）。');
    const heroTip = (topAug || topItem)
      ? '<div class="hero-tip">' +
          '<div class="hero-tip-kicker">版本成型思路 · 斗魂推荐样本</div>' +
          '<h3>「' + esc(heroNickname(c)) + '」成型核心</h3>' +
          '<p>' + tipBits.join(' ') + '</p>' +
          '<p class="hero-tip-effect">两者分别按前三率排序，并非联合胜率；没有同场组合数据时不伪造组合数值。</p>' +
        '</div>'
      : '';
    const loadout = (topAug || topItem)
      ? '<div class="d-section loadout-first"><h3>同套推荐搭配</h3><p class="d-note">当前样本下，该英雄推荐强化与推荐成装的最高前三率组合；分别排序，非联合样本。</p>' +
          '<div class="loadout-pair">' +
            (topAug ? buildChip(topAug, true, c.key, c.name) : '') +
            '<span class="loadout-plus">+</span>' +
            (topItem ? buildChip(topItem, false, c.key, c.name) : '') +
          '</div></div>'
      : '';

    openDrawer(
      '<div class="d-head">' +
        '<img class="d-avatar" src="' + esc(c.icon) + '" alt="' + esc(c.name) + '" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="d-name">' + esc(c.name) + '</div><div class="d-title">' + esc(c.key) + ' · 斗魂竞技场</div>' +
        '<div class="d-tags"><span class="tier tier-' + esc(c.tier) + '">' + esc(c.tier) + '</span>' +
        '<span class="conf conf-' + esc(c.confidence) + '"><b>' + esc(c.confidence) + '</b>' + (CONF_LABEL[c.confidence] || '') + '</span>' +
        arenaCrossHtml(c) + '<span class="meta-pill">强度排名 #' + c.rank + '</span></div></div>' +
      '</div>' +
      '<div class="d-stats">' +
        '<div class="d-stat"><span>前二率</span><b>' + pct(c.wr, 1) + '</b></div>' +
        '<div class="d-stat"><span>平均名次</span><b>' + Number(c.place || 0).toFixed(2) + '</b></div>' +
        '<div class="d-stat"><span>第一名率</span><b>' + pct(c.first, 1) + '</b></div>' +
      '</div>' +
      '<div class="secondary-stats">选取 ' + pct(c.pick, 1) + ' · 禁用 ' + pct(c.ban, 1) + ' · 出场 ' + num(c.games) + ' 场（次要）</div>' +
      heroTip + loadout +
      '<div class="d-section"><h3>推荐强化</h3><p class="d-note">按“前三率”排序，选取率为该强化在该英雄对局中的出现比例。</p>' + augHtml + '</div>' +
      '<div class="d-section"><h3>推荐成装</h3><p class="d-note">斗魂成装带强化属性，名称以游戏内为准；按前三率排序。</p>' + itemHtml + '</div>' +
      '<details class="more-details"><summary>排序校验（次要）</summary><p class="d-note">两个站点统计口径不同，只比较强度排序方向，不混合胜率数值。</p>' + cross + '</details>'
    );
    setHash('arena-hero', key);
  }

  function openArenaAugment(name) {
    const a = state.data && state.data.arena;
    if (!a) return;
    const x = a.augments.find(v => String(v.name) === String(name));
    if (!x) return;
    const info = a.augmentInfo && a.augmentInfo[String(name)];
    const fallbackNote = info && String(info.source || '').indexOf('ARAMKit') === 0
      ? '<p class="d-note source-note">该海克斯在斗魂官方数据中缺少文本，效果取自海斗资源，数值可能与斗魂模式不同。</p>'
      : '';
    const icon = x.icon
      ? '<img class="d-avatar" src="' + esc(x.icon) + '" alt="" onerror="this.style.visibility=\'hidden\'">'
      : '<span class="aug-rune rarity-' + esc(x.rarity) + '" style="width:64px;height:64px;font-size:30px;border-radius:12px">◆</span>';
    openDrawer(
      '<div class="d-head">' + icon +
        '<div><div class="d-name">' + esc(x.name) + '</div>' +
        '<div class="d-title">' + esc(x.rarity) + '海克斯 · 斗魂排名 #' + x.rank + '</div>' +
        '<div class="d-tags"><span class="tier tier-' + esc(x.tier) + '">' + esc(x.tier) + '</span>' +
        '<span class="rarity rarity-' + esc(x.rarity) + '">' + esc(x.rarity) + '</span>' +
        '<span class="conf conf-' + esc(x.confidence) + '"><b>' + esc(x.confidence) + '</b>' + (CONF_LABEL[x.confidence] || '') + '</span>' +
        '<span class="cross single"><span class="cross-dot"></span>单源</span></div></div>' +
      '</div>' +
      '<div class="d-section game-data effect-first"><h3>海克斯效果</h3>' + effectListHtml(info && info.effect) + fallbackNote + '</div>' +
      '<div class="d-stats">' +
        '<div class="d-stat"><span>前三率</span><b>' + pct(x.top3, 1) + '</b></div>' +
        '<div class="d-stat"><span>平均名次</span><b>' + Number(x.place || 0).toFixed(2) + '</b></div>' +
        '<div class="d-stat"><span>第一名率</span><b>' + pct(x.first, 1) + '</b></div>' +
      '</div>' +
      '<div class="secondary-stats">选取率 ' + pct(x.share, 1) + ' · 选取场次 ' + num(x.picks) + '（次要）</div>' +
      '<p class="d-note source-note">效果来自 CommunityDragon 的斗魂数据；数值为斗魂模式版本，与海克斯大乱斗不同。</p>'
    );
    setHash('arena-aug', name);
  }

  function setMode(mode, scroll) {
    state.mode = mode === 'arena' ? 'arena' : 'aram';
    document.body.dataset.mode = state.mode;
    $$('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    $('#aramView').hidden = state.mode !== 'aram';
    $('#arenaView').hidden = state.mode !== 'arena';
    if (state.data) renderAll();
    if (scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- 事件 ----------
  function bind() {
    $$('.mode-tab').forEach(btn => btn.addEventListener('click', () => {
      setMode(btn.dataset.mode);
    }));

    $$('[data-mode-jump]').forEach(btn => btn.addEventListener('click', () => {
      const target = $$('.mode-tab').find(b => b.dataset.mode === btn.dataset.modeJump);
      if (target) target.click();
    }));

    $$('#aramSeg .seg-btn').forEach(btn => btn.addEventListener('click', () => {
      state.board = btn.dataset.board;
      state.search = '';
      state.rarity = 'all';
      $('#searchInput').value = '';
      $$('#aramSeg .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
      $$('#rarityFilters .chip').forEach(c => c.classList.toggle('active', c.dataset.rarity === 'all'));
      renderBoard();
    }));

    let searchTimer = null;
    $('#searchInput').addEventListener('input', e => {
      clearTimeout(searchTimer);
      const value = e.target.value;
      searchTimer = setTimeout(() => {
        state.search = value;
        renderBoard();
      }, 120);
    });

    $$('#rarityFilters .chip').forEach(chip => chip.addEventListener('click', () => {
      state.rarity = chip.dataset.rarity;
      $$('#rarityFilters .chip').forEach(c => c.classList.toggle('active', c === chip));
      renderBoard();
    }));

    $('#sortSelect').addEventListener('change', e => {
      state.sort = e.target.value;
      renderBoard();
    });

    $$('#arenaSeg .seg-btn').forEach(btn => btn.addEventListener('click', () => {
      state.arenaBoard = btn.dataset.arenaBoard;
      state.arenaSearch = '';
      state.arenaRarity = 'all';
      state.arenaSort = 'place';
      $('#arenaSearchInput').value = '';
      $$('#arenaRarityFilters .chip').forEach(c => c.classList.toggle('active', c.dataset.arenaRarity === 'all'));
      renderArenaBoard();
    }));

    let arenaSearchTimer = null;
    $('#arenaSearchInput').addEventListener('input', e => {
      clearTimeout(arenaSearchTimer);
      const value = e.target.value;
      arenaSearchTimer = setTimeout(() => {
        state.arenaSearch = value;
        renderArenaBoard();
      }, 120);
    });

    $$('#arenaRarityFilters .chip').forEach(chip => chip.addEventListener('click', () => {
      state.arenaRarity = chip.dataset.arenaRarity;
      $$('#arenaRarityFilters .chip').forEach(c => c.classList.toggle('active', c === chip));
      renderArenaBoard();
    }));

    $('#arenaSortSelect').addEventListener('change', e => {
      state.arenaSort = e.target.value;
      renderArenaBoard();
    });

    document.addEventListener('click', e => {
      const arenaItem = e.target.closest('[data-arena-item]');
      if (arenaItem) { openArenaItem(arenaItem.dataset.arenaItem, arenaItem.dataset.arenaChampion); return; }
      const item = e.target.closest('[data-item]');
      if (item) { openItem(item.dataset.item, item.dataset.itemHero); return; }
      const arenaHero = e.target.closest('[data-arena-hero]');
      if (arenaHero) { openArenaChampion(arenaHero.dataset.arenaHero); return; }
      const arenaAug = e.target.closest('[data-arena-aug]');
      if (arenaAug) { openArenaAugment(arenaAug.dataset.arenaAug); return; }
      const aug = e.target.closest('[data-aug]');
      if (aug) { openAugment(aug.dataset.aug); return; }
      const hero = e.target.closest('[data-hero]');
      if (hero) { openHero(hero.dataset.hero); return; }
    });

    // 海克斯 / 装备悬浮数值
    const tooltip = $('#tooltip');
    let tipTarget = null;
    let tipTimer = null;
    const hideTip = () => {
      tooltip.hidden = true;
      tooltip.innerHTML = '';
    };
    const moveTip = (x, y) => {
      const pad = 10;
      const w = tooltip.offsetWidth;
      const h = tooltip.offsetHeight;
      let left = x + 16;
      let top = y + 18;
      if (left + w > window.innerWidth - pad) left = x - w - 16;
      if (left < pad) left = pad;
      if (top + h > window.innerHeight - pad) top = y - h - 16;
      if (top < pad) top = pad;
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    };
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tip]');
      if (!el || el === tipTarget) return;
      tipTarget = el;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => {
        if (tipTarget !== el) return;
        tooltip.innerHTML = el.getAttribute('data-tip') || '';
        tooltip.hidden = false;
        moveTip(e.clientX, e.clientY);
      }, 110);
    });
    document.addEventListener('mousemove', e => {
      if (!tooltip.hidden) moveTip(e.clientX, e.clientY);
    });
    document.addEventListener('mouseout', e => {
      const el = e.target.closest('[data-tip]');
      if (!el || el !== tipTarget) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      tipTarget = null;
      clearTimeout(tipTimer);
      hideTip();
    });
    document.addEventListener('scroll', () => { tipTarget = null; clearTimeout(tipTimer); hideTip(); }, true);
    document.addEventListener('click', () => { tipTarget = null; clearTimeout(tipTimer); hideTip(); }, true);
    document.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.build-click')) {
        e.preventDefault();
        e.target.click();
      }
    });

    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerBackdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

    $('#refreshBtn').addEventListener('click', triggerRefresh);
  }

  async function init() {
    bind();
    document.body.dataset.mode = state.mode;
    await loadConfig();
    const qm = new URLSearchParams(location.search).get('mode');
    if (qm === 'arena') setMode('arena', false);
    if (qm === 'aram') setMode('aram', false);
    await loadSnapshot();
    handleHash();
    window.addEventListener('hashchange', handleHash);
    if (state.local) {
      await pollStatus();
      setInterval(pollStatus, 10000);
      setInterval(() => { if (!state.refreshing) loadSnapshot(true); }, 5 * 60 * 1000);
    } else if (state.cloud) {
      $('#refreshBtn').hidden = true;
      if (state.data) setLive('ok', '自动更新 · ' + fmtTime(state.data.generatedAt));
      setInterval(() => loadSnapshot(true), 5 * 60 * 1000);
    } else {
      setLive('offline', '静态模式');
      $('#refreshBtn').disabled = true;
      $('#refreshBtn').title = '静态打开时无法自动刷新';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
