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

// -> { values: [{fullName, label}], errors: [], warnings: [] }
function parsePicklistValues(text, sep) {
    const values = [], errors = [], warnings = [];
    const seen = new Map();
    const rows = parseDelimited(text, sep);

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
        values.push({ fullName, label });
    });

    if (!values.length && !errors.length) errors.push('No valid rows found.');
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
    } else {
        need(cfg.globalValueSetName, 'Global Value Set API Name is required.');
        need(cfg.masterLabel, 'Master Label is required.');
        apiName(cfg.globalValueSetName, 'Global Value Set API Name should follow Salesforce naming conventions.');
    }
    if (!/^\d+\.0$/.test(cfg.apiVersion)) errors.push('API version must look like 66.0.');
    return errors;
}

// -> { values (snippet), completeXML, packageXML, filePath, instructions }
function buildOutputs(cfg, values) {
    const isField = cfg.mode === 'field';
    const indent = isField ? '                ' : '    ';
    const tag = isField ? 'value' : 'customValue';
    const snippet = values.map(v =>
`${indent}<${tag}>
${indent}    <fullName>${escapeXML(v.fullName)}</fullName>
${indent}    <default>false</default>
${indent}    <label>${escapeXML(v.label)}</label>
${indent}</${tag}>
`).join('');

    let completeXML, memberName, typeName, filePath;
    if (isField) {
        completeXML = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
        <fullName>${escapeXML(cfg.fieldName)}</fullName>
        <externalId>false</externalId>
        <label>${escapeXML(cfg.fieldLabel)}</label>
        <required>false</required>
        <trackTrending>false</trackTrending>
        <type>Picklist</type>
        <valueSet>
            <valueSetDefinition>
                <sorted>false</sorted>
${snippet}            </valueSetDefinition>
        </valueSet>
    </fields>
</CustomObject>`;
        memberName = `${cfg.objectName}.${cfg.fieldName}`;
        typeName = 'CustomField';
        filePath = `objects/${cfg.objectName}.object`;
    } else {
        completeXML = `<?xml version="1.0" encoding="UTF-8"?>
<GlobalValueSet xmlns="http://soap.sforce.com/2006/04/metadata">
${snippet}    <masterLabel>${escapeXML(cfg.masterLabel)}</masterLabel>
    <sorted>false</sorted>
</GlobalValueSet>`;
        memberName = cfg.globalValueSetName;
        typeName = 'GlobalValueSet';
        filePath = `globalValueSets/${cfg.globalValueSetName}.globalValueSet`;
    }

    const packageXML = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${escapeXML(memberName)}</members>
        <name>${typeName}</name>
    </types>
    <version>${escapeXML(cfg.apiVersion)}</version>
</Package>`;

    const zipName = isField ? `${cfg.objectName}_${cfg.fieldName}_deployment.zip` : `${cfg.globalValueSetName}_deployment.zip`;
    return { snippet, completeXML, packageXML, filePath, zipName };
}

if (typeof module !== 'undefined') {
    module.exports = { escapeXML, parseDelimited, parsePicklistValues, validateConfig, buildOutputs, DEFAULT_API_VERSION };
}
