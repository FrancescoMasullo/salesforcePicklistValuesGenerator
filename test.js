// Run: node test.js
const assert = require('node:assert/strict');
const { escapeXML, parsePicklistValues, validateConfig, buildOutputs } = require('./picklist.js');

// escaping (and no more "0 -> falsy" surprises)
assert.equal(escapeXML(`a&b<c>"d"'e'`), 'a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;');
assert.equal(escapeXML(0), '0');

// tab input, CRLF, header row, blank line
let r = parsePicklistValues('API Name\tLabel\r\nA_1\tAlpha\r\n\r\nB_2\tBeta', '\t');
assert.deepEqual(r.values, [{ fullName: 'A_1', label: 'Alpha' }, { fullName: 'B_2', label: 'Beta' }]);
assert.deepEqual(r.errors, []);

// quoted comma in label, escaped quote
r = parsePicklistValues('A,"Rossi, Mario"\nB,"say ""hi"""', ',');
assert.deepEqual(r.values.map(v => v.label), ['Rossi, Mario', 'say "hi"']);

// bad rows are reported, not silently dropped
r = parsePicklistValues('A,Alpha\nOnlyOneColumn\nA,Again\n', ',');
assert.equal(r.values.length, 2);
assert.equal(r.warnings.length, 1);
assert.match(r.errors[0], /duplicate API name "A"/);

assert.match(parsePicklistValues('', ',').errors[0], /No valid rows/);
assert.match(parsePicklistValues('A,' + 'x'.repeat(256), ',').errors[0], /label longer/);

// config validation
const field = { mode: 'field', objectName: 'Account', fieldName: 'Tier__c', fieldLabel: 'Tier', apiVersion: '66.0' };
assert.deepEqual(validateConfig(field), []);
assert.equal(validateConfig({ ...field, fieldLabel: '' })[0], 'Field Label is required.');
assert.equal(validateConfig({ ...field, apiVersion: 'x' }).length, 1);

// output
let o = buildOutputs(field, [{ fullName: 'A&B', label: 'Alpha' }]);
assert.match(o.completeXML, /<label>Tier<\/label>/);
assert.match(o.completeXML, /<fullName>A&amp;B<\/fullName>/);
assert.match(o.packageXML, /<members>Account\.Tier__c<\/members>/);
assert.match(o.packageXML, /<version>66\.0<\/version>/);
assert.equal(o.filePath, 'objects/Account.object');

o = buildOutputs({ mode: 'global', globalValueSetName: 'Colors', masterLabel: 'Colors', apiVersion: '66.0' }, [{ fullName: 'R', label: 'Red' }]);
assert.match(o.completeXML, /<customValue>[\s\S]*<masterLabel>Colors<\/masterLabel>/);
assert.equal(o.filePath, 'globalValueSets/Colors.globalValueSet');

console.log('All tests passed');
