const express = require('express');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ===== SCHEDULE DATA =====
// D: 09:00-17:00 | E: 17:00-01:00 | N: 01:00-09:00 | X: day off
const schedule = {
  "2026-04-27": { Areg: "Ardzakurd", Minas: "E",  Rubik: "X",  Levon: "N",  Arshak: "X",  Hrach: null },
  "2026-04-28": { Areg: "Ardzakurd", Minas: "E",  Rubik: "D",  Levon: "X",  Arshak: "N",  Hrach: "D"  },
  "2026-04-29": { Areg: "Ardzakurd", Minas: "X",  Rubik: "E",  Levon: "D",  Arshak: "N",  Hrach: "D"  },
  "2026-04-30": { Areg: "Ardzakurd", Minas: "D",  Rubik: "N",  Levon: "E",  Arshak: "X",  Hrach: "D"  },
  "2026-05-01": { Areg: "N",         Minas: "E",  Rubik: "X",  Levon: "N",  Arshak: "D",  Hrach: "X"  },
  "2026-05-02": { Areg: "X",         Minas: "N",  Rubik: "D",  Levon: "X",  Arshak: "E",  Hrach: "E"  },
  "2026-05-03": { Areg: "N",         Minas: "X",  Rubik: "E",  Levon: "D",  Arshak: "N",  Hrach: "E"  },
  "2026-05-04": { Areg: "X",         Minas: "N",  Rubik: "X",  Levon: "D",  Arshak: "N",  Hrach: "E"  },
  "2026-05-05": { Areg: "D",         Minas: "X",  Rubik: "N",  Levon: "E",  Arshak: "X",  Hrach: "N"  },
  "2026-05-06": { Areg: "E",         Minas: "D",  Rubik: "N",  Levon: "E",  Arshak: "N",  Hrach: "X"  },
  "2026-05-07": { Areg: "E",         Minas: "D",  Rubik: "X",  Levon: "N",  Arshak: "N",  Hrach: "D"  },
  "2026-05-08": { Areg: "X",         Minas: "N",  Rubik: "D",  Levon: "N",  Arshak: "X",  Hrach: "E"  },
  "2026-05-09": { Areg: "N",         Minas: "X",  Rubik: "D",  Levon: "X",  Arshak: "E",  Hrach: "N"  },
  "2026-05-10": { Areg: "N",         Minas: "D",  Rubik: "N",  Levon: "X",  Arshak: "E",  Hrach: "X"  },
};

const shiftTimes = {
  D:        { start: "09:00", end: "17:00", label: "Day Shift",     color: "#00ff88", bg: "#002a18" },
  E:        { start: "17:00", end: "01:00", label: "Evening Shift", color: "#ffcc00", bg: "#2a2200" },
  N:        { start: "01:00", end: "09:00", label: "Night Shift",   color: "#ff6b35", bg: "#2a1200" },
  X:        { start: null,    end: null,    label: "Day Off",        color: "#4a9eff", bg: "#001a2a" },
  Ardzakurd:{ start: null,    end: null,    label: "Ardzakurd",      color: "#a855f7", bg: "#1a0028" },
};

const people = ["Areg", "Minas", "Rubik", "Levon", "Arshak", "Hrach"];

function getArmeniaNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Yerevan" }));
}

function padZ(n) { return String(n).padStart(2, '0'); }

function dateStr(d) {
  return `${d.getFullYear()}-${padZ(d.getMonth()+1)}-${padZ(d.getDate())}`;
}

function getShiftWindow(dateObj, shiftCode) {
  const t = shiftTimes[shiftCode];
  if (!t || !t.start) return null;
  const [sh, sm] = t.start.split(':').map(Number);
  const [eh, em] = t.end.split(':').map(Number);
  const start = new Date(dateObj);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(dateObj);
  end.setHours(eh, em, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

function getPersonStatus(person, now) {
  let current = null, next = null;

  for (let offset = -1; offset <= 14; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const ds = dateStr(d);
    const code = schedule[ds]?.[person];
    if (!code || code === 'X' || code === 'Ardzakurd') continue;

    const win = getShiftWindow(d, code);
    if (!win) continue;

    const nowMs = now.getTime();
    if (win.start.getTime() <= nowMs && nowMs < win.end.getTime()) {
      current = { dateStr: ds, code, ...win,
        elapsed: nowMs - win.start.getTime(),
        remaining: win.end.getTime() - nowMs,
        total: win.end.getTime() - win.start.getTime(),
        progress: Math.floor(((nowMs - win.start.getTime()) / (win.end.getTime() - win.start.getTime())) * 100)
      };
    } else if (win.start.getTime() > nowMs && !next) {
      next = { dateStr: ds, code, ...win,
        startsIn: win.start.getTime() - nowMs
      };
    }
  }

  const todayCode = schedule[dateStr(now)]?.[person] || 'X';
  return { todayCode, current, next };
}

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.render('index', { people, shiftTimes, schedule });
});

app.get('/api/status', (req, res) => {
  const now = getArmeniaNow();
  const data = {};
  for (const p of people) {
    data[p] = getPersonStatus(p, now);
  }
  res.json({ serverTime: now.toISOString(), data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\x1b[32m[SHIFT-DASHBOARD]\x1b[0m http://localhost:${PORT}`);
});
