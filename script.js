// UI layer. XML/parsing logic lives in picklist.js.
const $ = id => document.getElementById(id);
let last = null; // outputs of the last successful generation
const selected = name => document.querySelector(`input[name="${name}"]:checked`).value;

function showStatus(type, messages) {
    const box = $('status');
    box.className = `status ${type}`;
    box.replaceChildren(...messages.map(m => Object.assign(document.createElement('div'), { textContent: m })));
    box.classList.toggle('hidden', !messages.length);
}

function getConfig() {
    return {
        mode: selected('mode'),
        objectName: $('objectName').value.trim(),
        fieldName: $('fieldName').value.trim(),
        fieldLabel: $('fieldLabel').value.trim(),
        globalValueSetName: $('globalValueSetName').value.trim(),
        masterLabel: $('masterLabel').value.trim(),
        apiVersion: $('apiVersion').value.trim(),
    };
}

document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', function () {
        $('fieldInputs').classList.toggle('hidden', this.value !== 'field');
        $('globalInputs').classList.toggle('hidden', this.value === 'field');
        clearOutputs();
    });
});

function generateXML() {
    const cfg = getConfig();
    const data = $('excelData').value;
    if (!data.trim()) return showStatus('error', ['Please paste your Excel data first.']);

    const { values, errors: dataErrors, warnings } = parsePicklistValues(data, selected('separator') === 'tab' ? '\t' : ',');
    const errors = [...validateConfig(cfg), ...dataErrors];
    if (errors.length) return showStatus('error', [...errors, ...warnings]);

    const out = last = buildOutputs(cfg, values);
    $('output').value = out.snippet;
    $('completeXML').value = out.completeXML;
    $('packageXML').value = out.packageXML;

    const isField = cfg.mode === 'field';
    $('deploymentInstructions').replaceChildren(...[
        `${isField ? 'Custom Field' : 'Global Value Set'} deployment steps:`,
        `1. Save the Complete XML as ${out.filePath}`,
        '2. Save the Package.xml as package.xml',
        '3. Zip both files keeping the folder structure (or use the button below)',
        '4. Deploy the ZIP with Salesforce Workbench',
        ...(isField ? ['⚠️ Deploying this field overwrites its label, required, externalId and trackTrending with the values shown in the XML.'] : []),
    ].map(t => Object.assign(document.createElement('div'), { textContent: t })));

    $('downloadBtn').style.display = $('workbenchBtn').style.display = 'inline-flex';
    showStatus(warnings.length ? 'warning' : 'success', [`${values.length} values generated.`, ...warnings]);
}

function clearData() {
    $('excelData').value = '';
    clearOutputs();
}

function clearOutputs() {
    last = null;
    $('output').value = $('completeXML').value = $('packageXML').value = '';
    $('deploymentInstructions').textContent = 'Choose a mode and generate XML to see deployment instructions.';
    $('downloadBtn').style.display = $('workbenchBtn').style.display = 'none';
    showStatus('', []);
}

function copyFrom(id, what) {
    const text = $(id).value;
    if (!text) return showStatus('error', ['Nothing to copy yet - generate XML first.']);
    navigator.clipboard.writeText(text)
        .then(() => showStatus('success', [`${what} copied to clipboard.`]))
        .catch(() => showStatus('error', ['Clipboard access denied - select the text and copy it manually.']));
}
const copyToClipboard = () => copyFrom('output', 'XML values');
const copyCompleteXML = () => copyFrom('completeXML', 'Complete XML');
const copyPackageXML = () => copyFrom('packageXML', 'Package.xml');

function openWorkbench() {
    window.open('https://workbench.developerforce.com/', '_blank', 'noopener');
}

function downloadDeploymentZip() {
    const completeXML = $('completeXML').value;
    const packageXML = $('packageXML').value;
    if (!last || !completeXML || !packageXML) return showStatus('error', ['Please generate XML first.']);
    if (typeof JSZip === 'undefined') return showStatus('error', ['ZIP library not loaded - copy the files manually.']);

    const { filePath, zipName } = last;
    const zip = new JSZip();
    zip.file('package.xml', packageXML);
    zip.file(filePath, completeXML);
    zip.generateAsync({ type: 'blob' })
        .then(blob => {
            const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: zipName });
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 100);
        })
        .catch(err => {
            console.error('Error generating ZIP:', err);
            showStatus('error', ['Error creating ZIP file - copy the XML files manually.']);
        });
}

// Auto-detect separator after paste
$('excelData').addEventListener('paste', function () {
    setTimeout(() => {
        const tabs = (this.value.match(/\t/g) || []).length;
        const commas = (this.value.match(/,/g) || []).length;
        if (tabs > commas) $('tab').checked = true;
        else if (commas > tabs) $('comma').checked = true;
    }, 100);
});

document.addEventListener('DOMContentLoaded', () => $('excelData').focus());

document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'Enter') {
        e.preventDefault();
        generateXML();
    } else if (e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copyCompleteXML();
    } else if (e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if ($('downloadBtn').style.display !== 'none') downloadDeploymentZip();
    }
});
