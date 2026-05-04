'use strict';

const VALID_CODES = ['D', 'E', 'N', 'X'];
const LABELS = { D: 'Day', E: 'Evening', N: 'Night', X: 'Off' };
let people = [];
let dates = [];
let schedule = {};

function setFeedback(message, type = 'info') {
  const feedback = document.getElementById('admin-feedback');
  feedback.textContent = message;
  feedback.style.color = type === 'error' ? '#ff3366' : '#00ff88';
}

function buildAdminTable() {
  const table = document.getElementById('admin-table');
  const headerRow = [
    '<tr>',
    '<th>OPERATOR</th>',
    ...dates.map((date) => `<th><div class="date-header"><input class="date-input" type="date" value="${date}" data-date="${date}" /><button class="remove-date-btn" type="button" title="Remove date">×</button></div></th>`),
    '</tr>'
  ].join('');

  const bodyRows = people.map((person) => {
    const cells = dates.map((date) => {
      const current = schedule[date] && schedule[date][person] ? schedule[date][person] : 'X';
      return `<td><select data-person="${person}" data-date="${date}">${VALID_CODES.map((code) => `<option value="${code}" ${code === current ? 'selected' : ''}>${code}</option>`).join('')}</select></td>`;
    }).join('');

    return `<tr><td><div class="person-row"><input class="person-name" value="${person}" data-person="${person}" /><button class="remove-person-btn" type="button" title="Remove operator">×</button></div></td>${cells}</tr>`;
  }).join('');

  table.innerHTML = `<thead>${headerRow}</thead><tbody>${bodyRows}</tbody>`;
}

function refreshTable() {
  buildAdminTable();
  attachControls();
}

function getFormData() {
  const nameInputs = Array.from(document.querySelectorAll('.person-name'));
  const dateInputs = Array.from(document.querySelectorAll('.date-input'));

  const newPeople = nameInputs.map((input) => input.value.trim()).filter(Boolean);
  const newDates = dateInputs.map((input) => input.value).filter(Boolean);

  const uniqueNames = new Set(newPeople);
  const uniqueDates = new Set(newDates);

  if (newPeople.length !== uniqueNames.size) {
    throw new Error('Operator names must be unique.');
  }

  if (newDates.length !== uniqueDates.size) {
    throw new Error('Dates must be unique.');
  }

  const invalidDate = newDates.find((date) => !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date));
  if (invalidDate) {
    throw new Error('Dates must use ISO format YYYY-MM-DD.');
  }

  const payloadSchedule = {};
  newDates.forEach((date) => {
    payloadSchedule[date] = {};
    newPeople.forEach((person) => {
      const select = document.querySelector(`select[data-person="${CSS.escape(person)}"][data-date="${CSS.escape(date)}"]`);
      payloadSchedule[date][person] = select ? select.value : 'X';
    });
  });

  return { people: newPeople, dates: newDates, schedule: payloadSchedule };
}

function attachControls() {
  document.querySelectorAll('.remove-person-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const row = event.target.closest('tr');
      if (!row) return;
      const nameInput = row.querySelector('.person-name');
      const name = nameInput?.value.trim();
      people = people.filter((person) => person !== name);
      refreshTable();
    });
  });

  document.querySelectorAll('.remove-date-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const headerCell = event.target.closest('th');
      if (!headerCell) return;
      const input = headerCell.querySelector('.date-input');
      const date = input?.value;
      dates = dates.filter((value) => value !== date);
      refreshTable();
    });
  });

  document.querySelectorAll('.date-input').forEach((input) => {
    input.addEventListener('change', (event) => {
      const cell = event.target.closest('th');
      if (!cell) return;
      const originalDate = event.target.dataset.date;
      const updatedDate = event.target.value.trim();
      if (!updatedDate) return;
      const index = dates.indexOf(originalDate);
      if (index !== -1) {
        dates[index] = updatedDate;
        event.target.dataset.date = updatedDate;
        refreshTable();
      }
    });
  });
}

function bindAdminActions() {
  document.getElementById('add-person-btn').addEventListener('click', () => {
    const input = document.getElementById('new-person');
    const value = input.value.trim();
    if (!value) {
      setFeedback('Enter a name before adding.', 'error');
      return;
    }
    if (people.includes(value)) {
      setFeedback('That operator already exists.', 'error');
      return;
    }
    people.push(value);
    input.value = '';
    refreshTable();
  });

  document.getElementById('add-date-btn').addEventListener('click', () => {
    const input = document.getElementById('new-date');
    const value = input.value.trim();
    if (!value) {
      setFeedback('Select a date before adding.', 'error');
      return;
    }
    if (dates.includes(value)) {
      setFeedback('That date is already in the schedule.', 'error');
      return;
    }
    dates.push(value);
    input.value = '';
    refreshTable();
  });

  document.getElementById('save-admin-btn').addEventListener('click', async () => {
    try {
      const payload = getFormData();
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Unable to save changes.');
      }
      setFeedback('Changes saved successfully. Refresh the SOC dashboard to see updates.');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  });
}

async function initialize() {
  const init = window.SOC_INIT || {};
  people = Array.isArray(init.people) ? init.people : [];
  dates = Array.isArray(init.dates) ? init.dates : [];
  schedule = typeof init.schedule === 'object' ? init.schedule : {};

  refreshTable();
  bindAdminActions();
  setFeedback('Admin panel loaded.');
  const clockEl = document.getElementById('live-clock');
  function updateClock() {
    clockEl.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan', hour12: false });
  }
  updateClock();
  setInterval(updateClock, 1000);
}

initialize().catch((error) => setFeedback(error.message, 'error'));
