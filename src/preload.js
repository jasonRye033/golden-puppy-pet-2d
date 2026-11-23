const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('pet', {
  onKey: (cb) => subscribe('key', cb),
  onKeyUp: (cb) => subscribe('keyup', cb),
  onMouse: (cb) => subscribe('mouse', cb),
  onWheel: (cb) => subscribe('wheel', cb),
  onCursor: (cb) => subscribe('cursor', cb),
  onHideLetters: (cb) => subscribe('hide-letters', cb),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: () => ipcRenderer.send('drag-move'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  contextMenu: () => ipcRenderer.send('context-menu'),
});
