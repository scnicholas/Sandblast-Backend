const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "newscanada.manual.data.json");

function readData() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      return { slots: {} };
    }
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  } catch (err) {
    console.error("[manual.service] read error:", err);
    return { slots: {} };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[manual.service] write error:", err);
  }
}

function getSlots() {
  return readData();
}

function saveSlot(payload) {
  const data = readData();

  const slotId = payload.slotId;
  if (!slotId) {
    throw new Error("Missing slotId");
  }

  data.slots[slotId] = {
    id: slotId,
    ...payload
  };

  writeData(data);

  return {
    ok: true,
    slots: data.slots
  };
}

function clearSlot(slotId) {
  const data = readData();

  if (data.slots[slotId]) {
    delete data.slots[slotId];
  }

  writeData(data);

  return {
    ok: true,
    slots: data.slots,
    story: { id: slotId }
  };
}

module.exports = {
  getSlots,
  saveSlot,
  clearSlot
};
