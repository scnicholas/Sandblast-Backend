'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../../index.js'), 'utf8');

assert.ok(
  source.includes('MARION_DOMAIN_RESPONSE_OBJECT_RENDER_GUARD_VERSION'),
  'render guard version marker missing'
);

assert.ok(
  source.includes('scalarMarionReplyCandidate(marion.response)'),
  'object-valued marion.response is not scalar-guarded'
);

assert.ok(
  source.includes('nestedMarionResponseReplyCandidate(marion.response)'),
  'nested domain response extractor missing'
);

assert.ok(
  !source.includes('    marion.response ||\\n    marion.reply ||'),
  'unsafe object-valued response precedence still present'
);

console.log('PASS marion_domain_response_object_index_guard_test');
