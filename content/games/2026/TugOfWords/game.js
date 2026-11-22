/* Tug of Words
 * Two players share one word and change it one letter at a time.
 *   Simple:   score 1 point per target letter in the word after each of your moves.
 *   Advanced: finish closest (edit distance) to your target word; a match is two games, seats swapped.
 * Static page: words.js (dictionary) and setups.js (fair start/target sets) are loaded before this file.
 */
(function () {
  'use strict';

  var MAX_LEN = 7;
  var MOVES_EACH = 10;
  var TOTAL_MOVES = MOVES_EACH * 2;
  var NO_PATH = 11; // "more than 10 moves" when a target can't be reached
  var ABC = 'abcdefghijklmnopqrstuvwxyz';
  var COLORS = ['red', 'blue'];
  var BOT_DELAY = 900; // ms before the computer moves, so players can follow

  var WORDS = new Set(window.TOW_WORDS.split(' '));
  var SETUPS = window.TOW_SETUPS;

  // ---------------------------------------------------------------- word logic

  /** How b differs from a: 'change' | 'add' | 'remove', or null if not exactly one edit. */
  function editKind(a, b) {
    if (a === b) return null;
    if (a.length === b.length) {
      var diff = 0;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
      return diff === 1 ? 'change' : null;
    }
    if (b.length === a.length + 1) return dropsTo(b, a) ? 'add' : null;
    if (a.length === b.length + 1) return dropsTo(a, b) ? 'remove' : null;
    return null;
  }

  /** True if removing one letter from longer gives shorter. */
  function dropsTo(longer, shorter) {
    var i = 0;
    while (i < shorter.length && longer[i] === shorter[i]) i++;
    return longer.slice(i + 1) === shorter.slice(i);
  }

  /** All dictionary words one change/add/remove away (max 7 letters). */
  function neighbors(w) {
    var out = new Set();
    var i, c, v;
    for (i = 0; i < w.length; i++) {
      for (c = 0; c < 26; c++) {
        if (ABC[c] === w[i]) continue;
        v = w.slice(0, i) + ABC[c] + w.slice(i + 1);
        if (WORDS.has(v)) out.add(v);
      }
      v = w.slice(0, i) + w.slice(i + 1);
      if (WORDS.has(v)) out.add(v);
    }
    if (w.length < MAX_LEN) {
      for (i = 0; i <= w.length; i++) {
        for (c = 0; c < 26; c++) {
          v = w.slice(0, i) + ABC[c] + w.slice(i);
          if (WORDS.has(v)) out.add(v);
        }
      }
    }
    return Array.from(out);
  }

  /** Levenshtein distance. */
  function editDistance(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Shortest chain of real, unused words from `from` to `to` (inclusive), or null. */
  function shortestPath(from, to, used) {
    if (from === to) return [from];
    var prev = new Map([[from, null]]);
    var queue = [from], head = 0;
    while (head < queue.length) {
      var u = queue[head++];
      var nb = neighbors(u);
      for (var k = 0; k < nb.length; k++) {
        var v = nb[k];
        if (prev.has(v)) continue;
        if (used.has(v) && v !== to) continue;
        prev.set(v, u);
        if (v === to) {
          var path = [v];
          while (prev.get(path[0]) !== null) path.unshift(prev.get(path[0]));
          return path;
        }
        queue.push(v);
      }
    }
    return null;
  }

  /** Simple mode: how many of the target's (distinct) letters appear anywhere in the word. */
  function letterCount(word, target) {
    var n = 0, seen = {};
    for (var i = 0; i < target.length; i++) {
      var ch = target[i];
      if (!seen[ch] && word.indexOf(ch) >= 0) n++;
      seen[ch] = true;
    }
    return n;
  }

  function lettersIn(word, target) {
    var out = [];
    for (var i = 0; i < target.length; i++) {
      if (word.indexOf(target[i]) >= 0 && out.indexOf(target[i]) < 0) out.push(target[i]);
    }
    return out;
  }

  /** Describe a move: kind, index of new/changed letter in `cur` (or -1), and a short text. */
  function describeMove(prev, cur) {
    var kind = editKind(prev, cur), i = 0;
    while (i < Math.min(prev.length, cur.length) && prev[i] === cur[i]) i++;
    if (kind === 'change') return { kind: kind, index: i, text: 'changed ' + prev[i].toUpperCase() + ' → ' + cur[i].toUpperCase() };
    if (kind === 'add') return { kind: kind, index: i, text: 'added ' + cur[i].toUpperCase() };
    if (kind === 'remove') return { kind: kind, index: -1, text: 'removed ' + prev[i].toUpperCase() };
    return { kind: null, index: -1, text: '' };
  }

  // ---------------------------------------------------------------- computer opponent
  // One bot for both modes; only the goal changes.
  //   Easy: best move for itself right now (ties broken at random).
  //   Hard: looks one reply ahead: never hands the opponent a win if it can avoid it,
  //         and prefers moves that leave the opponent's best reply weakest.

  /** Higher is better for player p: Simple = letters in the word, Advanced = minus letters away. */
  function goalScore(word, p) {
    return S.mode === 'simple' ? letterCount(word, S.targets[p]) : -editDistance(word, S.targets[p]);
  }

  /** Does this word win the game outright for player p? */
  function winsFor(word, p) {
    return S.mode === 'simple' ? letterCount(word, S.targets[p]) === S.targets[p].length : word === S.targets[p];
  }

  function chooseBotMove(p, level) {
    var q = 1 - p;
    var opts = neighbors(S.cur).filter(function (w) { return !S.used.has(w); });
    if (!opts.length) return null;
    for (var i = 0; i < opts.length; i++) if (winsFor(opts[i], p)) return opts[i];
    var best = null, bestVal = -Infinity;
    opts.forEach(function (w) {
      var val;
      if (S.mode === 'advanced' && w === S.targets[q]) val = -1e6;          // would hand the game away
      else if (level === 'easy') val = goalScore(w, p) + Math.random() * 0.5;
      else val = hardValue(w, p, q) + Math.random() * 0.01;
      if (val > bestVal) { bestVal = val; best = w; }
    });
    return best;
  }

  function hardValue(w, p, q) {
    var used2 = new Set(S.used); used2.add(w);
    var replies = neighbors(w).filter(function (r) { return !used2.has(r); });
    if (S.mode === 'simple') {
      // My points now, minus the most the opponent can score on their reply.
      var oppBest = 0;
      for (var i = 0; i < replies.length; i++) {
        if (winsFor(replies[i], q)) return -1000;
        oppBest = Math.max(oppBest, letterCount(replies[i], S.targets[q]));
      }
      return letterCount(w, S.targets[p]) - oppBest;
    }
    // Advanced: assume the opponent replies with the word that is worst for me.
    var worst = editDistance(w, S.targets[q]) - editDistance(w, S.targets[p]);
    for (var j = 0; j < replies.length; j++) {
      var r = replies[j];
      if (r === S.targets[q]) return -1000;
      worst = Math.min(worst, editDistance(r, S.targets[q]) - editDistance(r, S.targets[p]));
    }
    return worst - 0.01 * editDistance(w, S.targets[p]);
  }

  var botTimer = null;
  function cancelBot() { if (botTimer) { clearTimeout(botTimer); botTimer = null; } }

  function isBotTurn() { return !!(S && S.bot && !S.over && currentPlayer() === S.bot.player); }

  function scheduleBot() {
    cancelBot();
    var game = S;
    botTimer = setTimeout(function () {
      botTimer = null;
      if (S !== game || !isBotTurn()) return;
      var w = chooseBotMove(S.bot.player, S.bot.level);
      if (w) playMove(S.bot.player, w); else afterTurnChange();
    }, BOT_DELAY);
  }

  // ---------------------------------------------------------------- state

  var S = null;

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function newMatch(mode, names, bot) {
    var setup = pick(SETUPS[mode]);
    var targets = Math.random() < 0.5 ? [setup[1], setup[2]] : [setup[2], setup[1]];
    S = {
      mode: mode,
      names: names,
      start: setup[0],
      targets: targets,
      gameIndex: 0,
      results: [],
      bot: bot || null
    };
    startGame(0);
  }

  function startGame(firstPlayer) {
    cancelBot();
    S.first = firstPlayer;
    S.turn = 0;            // moves made so far, passes included
    S.cur = S.start;
    S.used = new Set([S.start]);
    S.history = [{ p: -1, word: S.start }];
    S.points = [0, 0];
    S.moves = [0, 0];
    S.over = false;
    S.lastDesc = null;
    S.lastNote = '';
    hideOverlay();
    showScreen('game');
    setMessage('', '');
    render();
    afterTurnChange();
  }

  function currentPlayer() { return (S.first + S.turn) % 2; }

  function name(p) { return S.names[p]; }

  /** Validate a typed word. Returns an error string, or '' if legal. */
  function validate(word) {
    var shown = word.toUpperCase();
    if (!word) return 'Type a word first.';
    if (!/^[a-z]+$/.test(word)) return 'Use letters only.';
    if (word === S.cur) return 'That is already the word. Change, add or remove one letter.';
    if (word.length > MAX_LEN) return 'Words can be at most ' + MAX_LEN + ' letters.';
    if (!editKind(S.cur, word)) return shown + ' is not one letter different from ' + S.cur.toUpperCase() + '. Change, add or remove exactly one letter.';
    if (!WORDS.has(word)) return shown + ' is not in our dictionary.';
    if (S.used.has(word)) return shown + ' was already played. No repeats!';
    return '';
  }

  function submitWord(raw) {
    if (!S || S.over || isBotTurn()) return false;
    var word = String(raw || '').trim().toLowerCase();
    var err = validate(word);
    if (err) { setMessage(err, 'error'); return false; }
    playMove(currentPlayer(), word);
    return true;
  }

  function playMove(p, word) {
    var desc = describeMove(S.cur, word);
    var got = S.mode === 'simple' ? lettersIn(word, S.targets[p]) : [];
    S.cur = word;
    S.used.add(word);
    S.history.push({ p: p, word: word, text: desc.text, got: got });
    S.moves[p]++;
    S.turn++;
    S.lastDesc = desc;
    var note = name(p) + ' ' + desc.text;
    if (S.mode === 'simple') {
      S.points[p] += got.length;
      note += got.length ? '  ·  +' + got.length + ' (' + got.join(', ').toUpperCase() + ')' : '  ·  +0';
    }
    S.lastNote = note;
    if (S.mode === 'simple' && got.length === S.targets[p].length) return finish({ instant: p });
    if (S.mode === 'advanced') {
      for (var q = 0; q < 2; q++) if (word === S.targets[q]) return finish({ instant: q });
    }
    setMessage('', '');
    if (S.turn >= TOTAL_MOVES) return finish({});
    render();
    afterTurnChange();
  }

  /** The current player chooses to pass: uses one of their moves, word unchanged, no points. */
  function passTurn() {
    if (!S || S.over || isBotTurn()) return false;
    var p = currentPlayer();
    S.history.push({ p: p, pass: true, auto: false });
    S.moves[p]++;
    S.turn++;
    S.lastDesc = null;
    S.lastNote = name(p) + ' passed' + (S.mode === 'simple' ? '  \u00b7  +0' : '');
    setMessage('', '');
    if (S.turn >= TOTAL_MOVES) { finish({}); return true; }
    render();
    afterTurnChange();
    return true;
  }

  /** Auto-pass players who have no legal move. */
  function afterTurnChange() {
    var passes = [];
    while (!S.over && S.turn < TOTAL_MOVES) {
      var legal = neighbors(S.cur).filter(function (w) { return !S.used.has(w); });
      if (legal.length) break;
      var p = currentPlayer();
      S.history.push({ p: p, pass: true, auto: true });
      S.moves[p]++;
      S.turn++;
      passes.push(name(p));
    }
    if (passes.length) setMessage(passes.join(' and ') + ' had no legal move and passed.', 'info');
    if (!S.over && S.turn >= TOTAL_MOVES) return finish({});
    render();
    if (isBotTurn()) scheduleBot(); else focusInput();
  }

  // ---------------------------------------------------------------- scoring

  function finish(opts) {
    S.over = true;
    render();
    if (S.mode === 'simple') finishSimple(opts); else finishAdvanced(opts);
  }

  function finishSimple(opts) {
    var w = null, reason;
    var finalCounts = [letterCount(S.cur, S.targets[0]), letterCount(S.cur, S.targets[1])];
    if (opts.instant !== undefined) {
      w = opts.instant;
      reason = name(w) + ' got all of ' + S.targets[w].toUpperCase() + ' into the word at once!';
    } else if (S.points[0] !== S.points[1]) {
      w = S.points[0] > S.points[1] ? 0 : 1;
      reason = 'Most points after ' + MOVES_EACH + ' moves each.';
    } else if (finalCounts[0] !== finalCounts[1]) {
      w = finalCounts[0] > finalCounts[1] ? 0 : 1;
      reason = 'Points tied, so the tiebreak decides: ' + name(w) + ' has more letters in the final word.';
    } else {
      reason = 'Points tied, and both have the same number of letters in the final word.';
    }
    var rows = [0, 1].map(function (p) {
      return '<tr><td class="' + COLORS[p] + '-text"><b>' + esc(name(p)) + '</b></td>' +
        '<td><b>' + S.points[p] + '</b></td><td>' + finalCounts[p] + ' of ' + S.targets[p].length + '</td></tr>';
    }).join('');
    showOverlay(
      twoColumn(
        title(w, 'wins!') +
        '<div class="result-sub">' + reason + '</div>' +
        setupHtml(S.start, S.targets, S.first) +
        '<table class="result-table"><tr><th>Player</th><th>Points</th><th>Letters in final word</th></tr>' + rows + '</table>' +
        '<div class="note">Final word: <b>' + S.cur.toUpperCase() + '</b></div>',
        '<div class="log-title">Every move</div><div class="log">' + moveLogHtml(S.history, S.targets, 'simple') + '</div>'),
      [btn('Play again (new words)', function () { newMatch('simple', S.names, S.bot); }),
       btn('Menu', showMenu, true)]);
  }

  function finishAdvanced(opts) {
    var eds = [editDistance(S.cur, S.targets[0]), editDistance(S.cur, S.targets[1])];
    var paths = [shortestPath(S.cur, S.targets[0], S.used), shortestPath(S.cur, S.targets[1], S.used)];
    var left = paths.map(function (pth) { return pth ? pth.length - 1 : NO_PATH; });
    var w = null, reason;
    if (opts.instant !== undefined) {
      w = opts.instant;
      reason = 'The word became ' + S.targets[w].toUpperCase() + ', ' + name(w) + '’s target!';
    } else if (eds[0] !== eds[1]) {
      w = eds[0] < eds[1] ? 0 : 1;
      reason = name(w) + ' finished fewer letters away from their target.';
    } else if (left[0] !== left[1]) {
      w = left[0] < left[1] ? 0 : 1;
      reason = 'Tied on letters away, so the tiebreak decides: ' + name(w) + ' has fewer real-word moves left.';
    } else {
      reason = 'Tied on letters away and on moves left.';
    }
    S.results.push({ first: S.first, word: S.cur, eds: eds, left: left, paths: paths, winner: w, history: S.history.slice() });

    var rows = [0, 1].map(function (p) {
      return '<tr><td class="' + COLORS[p] + '-text"><b>' + esc(name(p)) + '</b></td>' +
        '<td><b>' + eds[p] + '</b></td><td>' + (paths[p] ? left[p] : 'more than 10') + '</td></tr>';
    }).join('');
    var chains = [0, 1].map(function (p) { return chainHtml(p, paths[p]); }).join('');
    var gameNo = S.gameIndex + 1;
    var body = twoColumn(
      title(w, 'wins game ' + gameNo + '!', 'Game ' + gameNo + ' is a draw') +
      '<div class="result-sub">' + reason + '</div>' +
      setupHtml(S.start, S.targets, S.first) +
      '<table class="result-table"><tr><th>Player</th><th>Letters away</th><th>Moves left</th></tr>' + rows + '</table>' +
      '<div class="note">Shortest chains of real, unused words from the final word <b>' + S.cur.toUpperCase() + '</b>:</div>' + chains,
      '<div class="log-title">Every move in game ' + gameNo + '</div><div class="log">' + moveLogHtml(S.history, S.targets, 'advanced') + '</div>');

    if (S.gameIndex === 0) {
      showOverlay(body, [btn('Start game 2 (' + name(1) + ' goes first)', function () {
        S.gameIndex = 1;
        startGame(1);
      })]);
    } else {
      showOverlay(body, [btn('See match result', showMatchResult)]);
    }
  }

  function showMatchResult() {
    var tE = [0, 0], tL = [0, 0];
    S.results.forEach(function (r) { for (var p = 0; p < 2; p++) { tE[p] += r.eds[p]; tL[p] += r.left[p]; } });
    var w = null, reason;
    if (tE[0] !== tE[1]) { w = tE[0] < tE[1] ? 0 : 1; reason = 'Lowest total letters away across both games.'; }
    else if (tL[0] !== tL[1]) { w = tL[0] < tL[1] ? 0 : 1; reason = 'Totals tied on letters away; fewer total moves left breaks the tie.'; }
    else reason = 'Tied on total letters away and on total moves left.';
    var rows = S.results.map(function (r, i) {
      return '<tr><td>Game ' + (i + 1) + ' (' + esc(name(r.first)) + ' first, ended on ' + r.word.toUpperCase() + ')</td><td>' + r.eds[0] + '</td><td>' + r.eds[1] + '</td></tr>';
    }).join('') + '<tr><td><b>Total letters away</b></td><td><b>' + tE[0] + '</b></td><td><b>' + tE[1] + '</b></td></tr>' +
      '<tr><td>Total moves left (tiebreak)</td><td>' + tL[0] + '</td><td>' + tL[1] + '</td></tr>';
    var logs = S.results.map(function (r, i) {
      return '<div class="log-title">Game ' + (i + 1) + ' (' + esc(name(r.first)) + ' first)</div><div class="log log-half">' +
        moveLogHtml(r.history, S.targets, 'advanced') + '</div>';
    }).join('');
    showOverlay(
      twoColumn(
        title(w, 'wins the match!', 'The match is a draw') +
        '<div class="result-sub">' + reason + '</div>' +
        setupHtml(S.start, S.targets, 0).replace(/<div class="setup-first">.*?<\/div>/, '<div class="setup-first">Same words both games; seats swapped for game 2.</div>') +
        '<table class="result-table"><tr><th>Letters away</th><th class="">' + esc(name(0)) + '</th><th>' + esc(name(1)) + '</th></tr>' + rows + '</table>' +
        '<div class="note">Lower is better. "More than 10" moves left counts as 11.</div>',
        logs),
      [btn('New match (new words)', function () { newMatch('advanced', S.names, S.bot); }),
       btn('Menu', showMenu, true)]);
  }

  /** Start word, both targets, and who moved first. */
  function setupHtml(start, targets, first) {
    var h = '<div class="setup-box"><div class="setup-row"><span class="setup-label">Start word</span>' +
      tilesHtml(start, 'small') + '</div>';
    for (var p = 0; p < 2; p++) {
      h += '<div class="setup-row"><span class="setup-label ' + COLORS[p] + '-text">' + esc(name(p)) + '\u2019s target</span>' +
        tilesHtml(targets[p], 'small', function () { return ' target-' + COLORS[p]; }) + '</div>';
    }
    return h + '<div class="setup-first">' + esc(name(first)) + ' moved first.</div></div>';
  }

  /** Numbered list of every move with the score after it. */
  function moveLogHtml(history, targets, mode) {
    var cur = history[0].word, pts = [0, 0];
    var head = mode === 'simple'
      ? '<th>#</th><th>Player</th><th>Word</th><th>Move</th><th>+</th><th class="red-text">' + esc(name(0)) + '</th><th class="blue-text">' + esc(name(1)) + '</th>'
      : '<th>#</th><th>Player</th><th>Word</th><th>Move</th><th class="red-text">' + esc(name(0)) + ' away</th><th class="blue-text">' + esc(name(1)) + ' away</th>';
    var rows = history.map(function (h, i) {
      var who, word, move, extra;
      if (i === 0) {
        who = '<td>\u2014</td>'; word = '<b>' + h.word.toUpperCase() + '</b>'; move = 'start word';
      } else {
        who = '<td class="' + COLORS[h.p] + '-text"><b>' + esc(name(h.p)) + '</b></td>';
        if (h.pass) { word = '<span class="log-muted">' + cur.toUpperCase() + '</span>'; move = h.auto ? 'no legal move: passed' : 'passed'; }
        else { cur = h.word; word = '<b>' + h.word.toUpperCase() + '</b>'; move = h.text; }
      }
      if (mode === 'simple') {
        var gain = (i > 0 && !h.pass) ? h.got.length : 0;
        if (i > 0) pts[h.p] += gain;
        var gainTxt = i === 0 ? '' : h.pass ? '0' : '+' + gain + (gain ? ' (' + h.got.join('').toUpperCase() + ')' : '');
        extra = '<td>' + gainTxt + '</td><td>' + pts[0] + '</td><td>' + pts[1] + '</td>';
      } else {
        extra = '<td>' + editDistance(cur, targets[0]) + '</td><td>' + editDistance(cur, targets[1]) + '</td>';
      }
      return '<tr' + (h.pass ? ' class="log-pass"' : '') + '><td>' + (i === 0 ? '' : i) + '</td>' + who + '<td>' + word + '</td><td>' + move + '</td>' + extra + '</tr>';
    }).join('');
    return '<table class="log-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function twoColumn(left, right) {
    return '<div class="result-grid"><div class="result-left">' + left + '</div><div class="result-right">' + right + '</div></div>';
  }

  function chainHtml(p, path) {
    var inner = path
      ? path.map(function (w, i) {
          var cls = i === path.length - 1 ? ' target-' + COLORS[p] : '';
          return tilesHtml(w, 'small', function () { return cls; }) + (i < path.length - 1 ? '<span class="arrow">→</span>' : '');
        }).join('')
      : '<span>No chain of 10 moves or fewer</span>';
    return '<div class="chain"><span class="who ' + COLORS[p] + '-text">' + esc(name(p)) + '</span>' + inner + '</div>';
  }

  // ---------------------------------------------------------------- rendering

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function tilesHtml(word, size, clsFn) {
    // Shrink tiles for long words so they always fit their box.
    var fit = size === 'small' ? (word.length >= 6 ? ' slen6' : word.length === 5 ? ' slen5' : '')
                               : (word.length >= 7 ? ' len7' : word.length === 6 ? ' len6' : '');
    var h = '<div class="tiles' + fit + '">';
    for (var i = 0; i < word.length; i++) {
      h += '<div class="tile ' + (size || '') + (clsFn ? clsFn(i, word[i]) : '') + '">' + esc(word[i]) + '</div>';
    }
    return h + '</div>';
  }

  function render() {
    var p = currentPlayer();
    document.getElementById('mode-badge').textContent = S.mode === 'simple' ? 'Simple' : 'Advanced';
    var shownTurn = Math.min(S.turn + 1, TOTAL_MOVES);
    document.getElementById('progress').textContent =
      (S.mode === 'advanced' ? 'Game ' + (S.gameIndex + 1) + ' of 2  ·  ' : '') +
      (S.over ? 'Game over' : 'Move ' + shownTurn + ' of ' + TOTAL_MOVES);

    for (var q = 0; q < 2; q++) renderPanel(q, !S.over && q === p);

    var banner = document.getElementById('turn-banner');
    banner.className = 'turn-banner ' + (S.over ? '' : COLORS[p]);
    banner.textContent = S.over ? '' : isBotTurn() ? name(p) + ' is thinking…' : name(p) + '’s turn';
    banner.style.visibility = S.over ? 'hidden' : 'visible';

    var desc = S.lastDesc;
    document.getElementById('word').innerHTML = tilesHtml(S.cur, '', function (i, ch) {
      var cls = '';
      if (S.mode === 'simple') {
        if (S.targets[0].indexOf(ch) >= 0) cls += ' r';
        else if (S.targets[1].indexOf(ch) >= 0) cls += ' b';
      }
      if (desc && desc.index === i) cls += ' changed';
      return cls;
    });
    document.getElementById('last-move').textContent = S.lastNote || 'Start word';

    var hist = S.history.map(function (h) {
      if (h.pass) return '<span class="hp">' + esc(name(h.p)) + ' passed</span>';
      return '<span class="' + (h.p < 0 ? 'h0' : h.p === 0 ? 'hr' : 'hb') + '">' + esc(h.word) + '</span>';
    }).join('');
    document.getElementById('history').innerHTML = hist;

    var input = document.getElementById('move-input');
    input.disabled = S.over || isBotTurn();
    document.getElementById('move-btn').disabled = S.over || isBotTurn();
    document.getElementById('pass-btn').disabled = S.over || isBotTurn();
  }

  function renderPanel(p, active) {
    var el = document.getElementById('panel-' + p);
    var color = COLORS[p];
    el.className = 'player ' + color + (active ? ' active' : '');
    var t = S.targets[p];
    var h = '<div class="pname ' + color + '-text">' + esc(name(p)) + '</div>';
    var tag = S.bot && S.bot.player === p ? 'Thinking\u2026' : 'Your turn';
    h += '<div class="turn-tag" style="background:var(--' + color + ');visibility:' + (active ? 'visible' : 'hidden') + '">' + tag + '</div>';
    h += '<div class="plabel">Target</div>';
    if (S.mode === 'simple') {
      h += tilesHtml(t, 'small', function (i, ch) { return S.cur.indexOf(ch) >= 0 ? ' lit-' + color : ' target-' + color; });
      var now = letterCount(S.cur, t);
      h += '<div class="psmall">' + now + ' of ' + t.length + ' letters in the word now</div>';
      h += '<div class="plabel">Points</div><div class="pbig ' + color + '-text">' + S.points[p] + '</div>';
    } else {
      h += tilesHtml(t, 'small', function () { return ' target-' + color; });
      h += '<div class="plabel">Letters away</div><div class="pbig ' + color + '-text">' + editDistance(S.cur, t) + '</div>';
      if (S.gameIndex === 1 && S.results.length) {
        h += '<div class="psmall">Game 1: ' + S.results[0].eds[p] + ' away</div>';
      }
    }
    h += '<div class="psmall">Moves used: ' + S.moves[p] + ' / ' + MOVES_EACH + '</div>';
    h += '<div class="reminder">' + (S.mode === 'simple'
      ? 'After your move, you score 1 point for each of your target letters in the word.'
      : 'Make the word your target. After 10 moves each, fewer letters away wins.') + '</div>';
    el.innerHTML = h;
  }

  function title(w, winText, drawText) {
    if (w === null) return '<div class="result-title">' + (drawText || 'It’s a draw') + '</div>';
    return '<div class="result-title ' + COLORS[w] + '-text">' + esc(name(w)) + ' ' + winText + '</div>';
  }

  function btn(label, fn, secondary) { return { label: label, fn: fn, secondary: !!secondary }; }

  function showOverlay(html, buttons) {
    document.getElementById('result-body').innerHTML = html;
    var actions = document.getElementById('result-actions');
    actions.innerHTML = '';
    buttons.forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.textContent = b.label;
      if (b.secondary) el.className = 'secondary';
      el.addEventListener('click', b.fn);
      actions.appendChild(el);
    });
    document.getElementById('overlay').classList.remove('hidden');
    var first = actions.querySelector('button');
    if (first) first.focus();
  }

  function hideOverlay() { document.getElementById('overlay').classList.add('hidden'); }

  function setMessage(text, kind) {
    var m = document.getElementById('message');
    m.textContent = text;
    m.className = 'message ' + (kind || '');
  }

  function focusInput() {
    var input = document.getElementById('move-input');
    input.value = '';
    if (!S.over) input.focus();
  }

  function showScreen(id) {
    document.getElementById('menu').classList.toggle('hidden', id !== 'menu');
    document.getElementById('game').classList.toggle('hidden', id !== 'game');
  }

  function showMenu() {
    cancelBot();
    S = null;
    hideOverlay();
    showScreen('menu');
  }

  function readOpponent() {
    var el = document.querySelector('input[name="opponent"]:checked');
    var v = el ? el.value : 'human';
    return v === 'human' ? null : { player: 1, level: v };
  }

  function readNames() {
    var r = document.getElementById('name-red').value.trim() || 'Red';
    var bot = readOpponent();
    var b = bot ? 'Computer (' + (bot.level === 'easy' ? 'Easy' : 'Hard') + ')'
                : document.getElementById('name-blue').value.trim() || 'Blue';
    return [r, b];
  }

  function syncOpponentUI() {
    var bot = readOpponent();
    var blue = document.getElementById('name-blue');
    blue.disabled = !!bot;
    blue.placeholder = bot ? 'Computer' : 'Blue';
  }

  // ---------------------------------------------------------------- layout + wiring

  function fit() {
    var stage = document.getElementById('stage');
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 960);
    stage.style.transform = 'scale(' + s + ')';
    stage.style.left = Math.max(0, (window.innerWidth - 1280 * s) / 2) + 'px';
    stage.style.top = Math.max(0, (window.innerHeight - 960 * s) / 2) + 'px';
  }

  function init() {
    window.addEventListener('resize', fit);
    fit();
    document.getElementById('pick-simple').addEventListener('click', function () { newMatch('simple', readNames(), readOpponent()); });
    document.getElementById('pick-advanced').addEventListener('click', function () { newMatch('advanced', readNames(), readOpponent()); });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="opponent"]'), function (el) {
      el.addEventListener('change', syncOpponentUI);
    });
    syncOpponentUI();
    document.getElementById('btn-menu').addEventListener('click', showMenu);
    document.getElementById('pass-btn').addEventListener('click', function () { passTurn(); });
    document.getElementById('move-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('move-input');
      if (submitWord(input.value)) input.value = '';
      else input.select();
    });
  }

  // Exposed for testing in the browser console / automated tests.
  window.TOW = {
    editKind: editKind, neighbors: neighbors, editDistance: editDistance, shortestPath: shortestPath,
    letterCount: letterCount, validate: function (w) { return validate(w); },
    submitWord: submitWord, passTurn: passTurn, newMatch: newMatch, state: function () { return S; },
    chooseBotMove: function (p, level) { return chooseBotMove(p, level); },
    startWith: function (mode, start, targets, names, bot) {
      S = { mode: mode, names: names || ['Red', 'Blue'], start: start, targets: targets, gameIndex: 0, results: [], bot: bot || null };
      startGame(0);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
