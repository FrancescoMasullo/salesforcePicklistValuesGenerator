// Pure logic: no DOM access, so it can be tested in Node (see test.js).

const DEFAULT_API_VERSION = '66.0';
const API_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const MAX_LABEL = 255;

function escapeXML(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Delimited-text parser: handles quoted cells (with sep, newlines and "" inside), CRLF.
function parseDelimited(text, sep) {
    const rows = [];
    let row = [], cell = '', quoted = false, cellStart = true;
    const endRow = () => { row.push(cell); rows.push(row); row = []; cell = ''; cellStart = true; };
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (c === '"') quoted = false;
            else cell += c;
        } else if (c === '"' && cellStart) {
            quoted = true; cellStart = false;
        } else if (c === sep) {
            row.push(cell); cell = ''; cellStart = true;
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            endRow();
        } else {
            cell += c; cellStart = false;
        }
    }
    if (cell !== '' || row.length) endRow();
    return rows;
}

const HEADER_COL0 = /^(api[\s_-]*name|full[\s_-]*name|value)$/i;
const HEADER_COL1 = /^label$/i;
const TRUE_RE = /^(true|yes|y|1|x)$/i;
const FALSE_RE = /^(false|no|n|0)$/i;

// Columns: API Name | Label | Default (opt.) | Active (opt., blank = true) | Controlling values (opt., ";"-separated)
// opts: { mode: 'field'|'global', controllingField: string }
// -> { values: [{fullName, label, isDefault, isActive, controllingValues}], errors, warnings }
function parsePicklistValues(text, sep, opts = {}) {
    const values = [], errors = [], warnings = [];
    const seen = new Map();
    const rows = parseDelimited(text, sep);

    const bool = (raw, fallback, line, what) => {
        const t = (raw ?? '').trim();
        if (!t) return fallback;
        if (TRUE_RE.test(t)) return true;
        if (FALSE_RE.test(t)) return false;
        errors.push(`Row ${line}: ${what} must be true/false (got "${t}").`);
        return fallback;
    };

    rows.forEach((cells, idx) => {
        const line = idx + 1;
        if (cells.every(c => !c.trim())) return; // blank line
        const fullName = (cells[0] ?? '').trim();
        const label = (cells[1] ?? '').trim();

        if (idx === 0 && HEADER_COL0.test(fullName) && HEADER_COL1.test(label)) {
            warnings.push('Header row detected and skipped.');
            return;
        }
        if (!fullName || !label) {
            warnings.push(`Row ${line} skipped: expected "API Name" and "Label" (got ${cells.length} column${cells.length === 1 ? '' : 's'}).`);
            return;
        }
        if (fullName.length > MAX_LABEL) errors.push(`Row ${line}: API name longer than ${MAX_LABEL} characters.`);
        if (label.length > MAX_LABEL) errors.push(`Row ${line}: label longer than ${MAX_LABEL} characters.`);
        const key = fullName.toLowerCase();
        if (seen.has(key)) errors.push(`Row ${line}: duplicate API name "${fullName}" (first seen at row ${seen.get(key)}).`);
        else seen.set(key, line);

        const controllingValues = [...new Set((cells[4] ?? '').split(';').map(v => v.trim()).filter(Boolean))];
        if (opts.controllingField && !controllingValues.length) {
            warnings.push(`Row ${line} ("${fullName}") has no controlling values: it will not be selectable under any controlling value.`);
        }
        if (!opts.controllingField && controllingValues.length) {
            warnings.push(`Row ${line}: controlling values ignored because no Controlling Field is set.`);
        }
        values.push({
            fullName, label,
            isDefault: bool(cells[2], false, line, 'Default'),
            isActive: bool(cells[3], true, line, 'Active'),
            controllingValues: opts.controllingField ? controllingValues : [],
        });
    });

    if (!values.length && !errors.length) errors.push('No valid rows found.');
    if (opts.mode === 'field' && values.filter(v => v.isDefault).length > 1) {
        errors.push('More than one default value: a single-select picklist allows only one.');
    }
    return { values, errors, warnings };
}

function validateConfig(cfg) {
    const errors = [];
    const need = (v, msg) => { if (!v) errors.push(msg); };
    const apiName = (v, msg) => { if (v && !API_NAME_PATTERN.test(v)) errors.push(msg); };

    if (cfg.mode === 'field') {
        need(cfg.objectName, 'Object API Name is required.');
        need(cfg.fieldName, 'Field API Name is required.');
        need(cfg.fieldLabel, 'Field Label is required.');
        apiName(cfg.objectName, 'Object API Name should follow Salesforce naming conventions.');
        apiName(cfg.fieldName, 'Field API Name should follow Salesforce naming conventions.');
        apiName(cfg.controllingField, 'Controlling Field API Name should follow Salesforce naming conventions.');
        if (cfg.controllingField && cfg.controllingField === cfg.fieldName) errors.push('Controlling Field cannot be the field itself.');
    } else {
        need(cfg.globalValueSetName, 'Global Value Set API Name is required.');
        need(cfg.masterLabel, 'Master Label is required.');
        apiName(cfg.globalValueSetName, 'Global Value Set API Name should follow Salesforce naming conventions.');
    }
    if (!/^\d+\.0$/.test(cfg.apiVersion)) errors.push('API version must look like 66.0.');
    return errors;
}

const indentBlock = (text, n) => text.split('\n').map(l => (l ? ' '.repeat(n) + l : l)).join('\n');

// cfg.format: 'mdapi' (Workbench: package.xml + objects/X.object) | 'sfdx' (source format, single *-meta.xml)
// -> { snippet, completeXML, packageXML, filePath, files: {path: content}, zipName }
function buildOutputs(cfg, values) {
    const isField = cfg.mode === 'field';
    const sfdx = cfg.format === 'sfdx';
    const tag = isField ? 'value' : 'customValue';
    const valueXML = v => `<${tag}>
    <fullName>${escapeXML(v.fullName)}</fullName>
    <default>${v.isDefault ? 'true' : 'false'}</default>
    <label>${escapeXML(v.label)}</label>${v.isActive === false ? '\n    <isActive>false</isActive>' : ''}
</${tag}>
`;
    const snippet = values.map(valueXML).join('');

    let completeXML, memberName, typeName, filePath;
    if (isField) {
        const settings = cfg.controllingField
            ? values.filter(v => v.controllingValues?.length).map(v => `<valueSettings>
${v.controllingValues.map(c => `    <controllingFieldValue>${escapeXML(c)}</controllingFieldValue>`).join('\n')}
    <valueName>${escapeXML(v.fullName)}</valueName>
</valueSettings>
`).join('')
            : '';
        const controlling = cfg.controllingField ? `    <controllingField>${escapeXML(cfg.controllingField)}</controllingField>\n` : '';
        const field = `<fullName>${escapeXML(cfg.fieldName)}</fullName>
<externalId>false</externalId>
<label>${escapeXML(cfg.fieldLabel)}</label>
<required>false</required>
<trackTrending>false</trackTrending>
<type>Picklist</type>
<valueSet>
${controlling}    <valueSetDefinition>
        <sorted>false</sorted>
${indentBlock(snippet, 8)}    </valueSetDefinition>
${indentBlock(settings, 4)}</valueSet>
`;
        completeXML = sfdx
            ? `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
${indentBlock(field, 4)}</CustomField>`
            : `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
${indentBlock(field, 8)}    </fields>
</CustomObject>`;
        memberName = `${cfg.objectName}.${cfg.fieldName}`;
        typeName = 'CustomField';
        filePath = sfdx
            ? `force-app/main/default/objects/${cfg.objectName}/fields/${cfg.fieldName}.field-meta.xml`
            : `objects/${cfg.objectName}.object`;
    } else {
        completeXML = `<?xml version="1.0" encoding="UTF-8"?>
<GlobalValueSet xmlns="http://soap.sforce.com/2006/04/metadata">
${indentBlock(snippet, 4)}    <masterLabel>${escapeXML(cfg.masterLabel)}</masterLabel>
    <sorted>false</sorted>
</GlobalValueSet>`;
        memberName = cfg.globalValueSetName;
        typeName = 'GlobalValueSet';
        filePath = sfdx
            ? `force-app/main/default/globalValueSets/${cfg.globalValueSetName}.globalValueSet-meta.xml`
            : `globalValueSets/${cfg.globalValueSetName}.globalValueSet`;
    }

    const packageXML = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${escapeXML(memberName)}</members>
        <name>${typeName}</name>
    </types>
    <version>${escapeXML(cfg.apiVersion)}</version>
</Package>`;

    const files = sfdx ? { [filePath]: completeXML } : { 'package.xml': packageXML, [filePath]: completeXML };
    const base = isField ? `${cfg.objectName}_${cfg.fieldName}` : cfg.globalValueSetName;
    return { snippet, completeXML, packageXML, filePath, files, zipName: `${base}_${sfdx ? 'sfdx' : 'deployment'}.zip` };
}

if (typeof module !== 'undefined') {
    module.exports = { escapeXML, parseDelimited, parsePicklistValues, validateConfig, buildOutputs, DEFAULT_API_VERSION };
}
