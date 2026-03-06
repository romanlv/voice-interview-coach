let container = null;
let emptyState = null;

export function initRenderer(containerEl, emptyStateEl) {
  container = containerEl;
  emptyState = emptyStateEl;
}

export function addTranscriptItem(text, isFinal, isAgent = false) {
  if (emptyState && !emptyState.classList.contains('hidden')) {
    emptyState.classList.add('hidden');
  }

  const item = document.createElement('div');
  item.className = isFinal
    ? 'transcript-item'
    : 'transcript-item transcript-item--interim';

  if (isAgent) {
    item.classList.add('transcript-item--agent');
  }

  const timestamp = document.createElement('div');
  timestamp.className = 'transcript-item__timestamp';
  timestamp.textContent = (isAgent ? 'AI - ' : '') + new Date().toLocaleTimeString();
  item.appendChild(timestamp);

  const textDiv = document.createElement('div');
  textDiv.className = 'transcript-item__text';
  textDiv.textContent = text;
  item.appendChild(textDiv);

  const lastItem = container.lastElementChild;
  if (
    !isFinal &&
    !isAgent &&
    lastItem &&
    lastItem !== emptyState &&
    lastItem.classList.contains('transcript-item--interim')
  ) {
    container.replaceChild(item, lastItem);
  } else {
    container.appendChild(item);
  }

  container.scrollTop = container.scrollHeight;
}
