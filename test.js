// Run: node test.js
const assert = require('node:assert/strict');
const { escapeXML, parsePicklistValues, validateConfig, buildOutputs } = require('./picklist.js');

// escaping (and no more "0 -> falsy" surprises)
assert.equal(escapeXML(`a&b<c>"d"'e'`), 'a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;');
assert.equal(escapeXML(0), '0');

// tab input, CRLF, header row, blank line
let r = parsePicklistValues('API Name\tLabel\r\nA_1\tAlpha\r\n\r\nB_2\tBeta', '\t');
assert.deepEqual(r.values.map(v => [v.fullName, v.label]), [['A_1', 'Alpha'], ['B_2', 'Beta']]);
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


// ---- extended columns, dependent picklist, SFDX ----
r = parsePicklistValues('A,Alpha,yes,\nB,Beta,,no\nC,Gamma,maybe', ',', { mode: 'field' });
assert.deepEqual(r.values.slice(0, 2).map(v => [v.isDefault, v.isActive]), [[true, true], [false, false]]);
assert.match(r.errors[0], /Default must be true\/false/);
assert.match(parsePicklistValues('A,a,true\nB,b,true', ',', { mode: 'field' }).errors[0], /only one/);
assert.deepEqual(parsePicklistValues('A,a,true\nB,b,true', ',', { mode: 'global' }).errors, []);

r = parsePicklistValues('Rome,Roma,,,IT\nParis,Parigi,,,FR;IT\nOrphan,Orfano', ',', { mode: 'field', controllingField: 'Country__c' });
assert.deepEqual(r.values[1].controllingValues, ['FR', 'IT']);
assert.match(r.warnings[0], /no controlling values/);
const dep = buildOutputs({ ...field, controllingField: 'Country__c' }, r.values);
assert.match(dep.completeXML, /<controllingField>Country__c<\/controllingField>/);
assert.match(dep.completeXML, /<valueSettings>\s*<controllingFieldValue>FR<\/controllingFieldValue>\s*<controllingFieldValue>IT<\/controllingFieldValue>\s*<valueName>Paris<\/valueName>/);
assert.equal((dep.completeXML.match(/<valueSettings>/g) || []).length, 2); // Orphan gets none
assert.match(validateConfig({ ...field, controllingField: 'Tier__c' })[0], /itself/);

const inactive = buildOutputs(field, [{ fullName: 'X', label: 'X', isDefault: true, isActive: false, controllingValues: [] }]);
assert.match(inactive.snippet, /<default>true<\/default>\s*<label>X<\/label>\s*<isActive>false<\/isActive>/);

let sf = buildOutputs({ ...field, format: 'sfdx' }, [{ fullName: 'A', label: 'Alpha', isDefault: false, isActive: true, controllingValues: [] }]);
assert.deepEqual(Object.keys(sf.files), ['force-app/main/default/objects/Account/fields/Tier__c.field-meta.xml']);
assert.match(sf.completeXML, /^<\?xml[^>]*\?>\n<CustomField [^>]*>\n    <fullName>Tier__c<\/fullName>/);
assert.ok(!sf.completeXML.includes('CustomObject'));
sf = buildOutputs({ mode: 'global', globalValueSetName: 'Colors', masterLabel: 'Colors', apiVersion: '66.0', format: 'sfdx' }, [{ fullName: 'R', label: 'Red' }]);
assert.deepEqual(Object.keys(sf.files), ['force-app/main/default/globalValueSets/Colors.globalValueSet-meta.xml']);
assert.deepEqual(Object.keys(buildOutputs(field, []).files), ['package.xml', 'objects/Account.object']);

console.log('All tests passed');
