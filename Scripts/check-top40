const fs = require('fs');
const path = require('path');

const dir = 'Data/top40weekly';

for (let y = 1990; y <= 1999; y++) {
  const file = path.join(dir, 'top100_' + y + '.json');
  if (!fs.existsSync(file)) {
    console.log(y, 'MISSING FILE');
    continue;
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(y, data.length);
}
