const vscode = acquireVsCodeApi();
const tree = document.querySelector('#tree');
const status = document.querySelector('#status');
const summary = document.querySelector('#summary');
const filter = document.querySelector('#filter');
const saved = vscode.getState() ?? {};
let rootNode;

filter.value = saved.filter ?? '';

function setStatus(message) {
  status.textContent = message;
  status.hidden = false;
  tree.hidden = true;
  summary.textContent = '';
}

function openButton(node) {
  if (!node.openable || !node.uri?.startsWith('file:') || node.type === 'workspace' || node.type.startsWith('output')) return undefined;
  const button = document.createElement('button');
  button.className = 'open';
  button.type = 'button';
  button.textContent = 'Open';
  button.title = `Open ${node.name}`;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    vscode.postMessage({ type: 'openFile', uri: node.uri });
  });
  return button;
}

function row(node, className) {
  const element = document.createElement(className === 'leaf' ? 'div' : 'summary');
  element.className = className;
  const kind = document.createElement('span');
  kind.className = 'kind';
  kind.textContent = node.type;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = node.name;
  name.title = node.name;
  element.append(kind, name);
  const button = openButton(node);
  if (button) element.append(button);
  return element;
}

function nodeElement(node, depth = 0) {
  const item = document.createElement('li');
  item.dataset.search = `${node.name} ${node.type}`.toLocaleLowerCase();
  const children = node.children ?? [];
  if (children.length === 0) {
    item.append(row(node, 'leaf'));
    return item;
  }

  const details = document.createElement('details');
  details.open = depth < 2;
  details.append(row(node, 'branch'));
  const list = document.createElement('ul');
  for (const child of children) list.append(nodeElement(child, depth + 1));
  details.append(list);
  item.append(details);
  return item;
}

function nodeCount(node) {
  return 1 + (node.children ?? []).reduce((count, child) => count + nodeCount(child), 0);
}

function render(node) {
  rootNode = node;
  tree.replaceChildren();
  if (!node?.name) {
    setStatus('No Terragrunt configurations were found in this workspace.');
    return;
  }
  const list = document.createElement('ul');
  list.append(nodeElement(node));
  tree.append(list);
  tree.hidden = false;
  status.hidden = true;
  const count = Math.max(0, nodeCount(node) - 1);
  summary.textContent = `${count} configuration${count === 1 ? '' : 's'}`;
  applyFilter();
}

function setExpanded(open) {
  for (const details of tree.querySelectorAll('details')) details.open = open;
}

function applyFilter() {
  const query = filter.value.trim().toLocaleLowerCase();
  vscode.setState({ filter: filter.value });
  const items = [...tree.querySelectorAll('li')].reverse();
  for (const item of items) {
    const ownMatch = !query || item.dataset.search.includes(query);
    const childMatch = [...item.querySelectorAll(':scope > details > ul > li')].some(child => !child.hidden);
    item.hidden = !ownMatch && !childMatch;
    item.classList.toggle('match', Boolean(query && ownMatch));
    if (query && childMatch) item.querySelector(':scope > details')?.setAttribute('open', '');
  }
}

document.querySelector('#expand').addEventListener('click', () => setExpanded(true));
document.querySelector('#collapse').addEventListener('click', () => {
  setExpanded(false);
  tree.querySelector('details')?.setAttribute('open', '');
});
filter.addEventListener('input', applyFilter);
window.addEventListener('message', event => {
  if (event.data.type === 'treeData') render(event.data.data);
  if (event.data.type === 'treeError') setStatus(event.data.message);
});

if (rootNode) render(rootNode);
