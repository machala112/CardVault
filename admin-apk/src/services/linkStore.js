// src/services/linkStore.js — Holds the user's permanent share link
let _link = null;
const _listeners = new Set();

export function setShareLink(link) {
  _link = link;
  _listeners.forEach(fn => fn(link));
}

export function getShareLink() {
  return _link;
}

export function onShareLinkChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getShareUrl() {
  if (!_link) return null;
  // link is { token, url } or just token string
  if (typeof _link === 'string') return `https://card.novamail.store/#/r/${_link}`;
  return _link.url || `https://card.novamail.store/#/r/${_link.token}`;
}
