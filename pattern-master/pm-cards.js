// 「牌型大師」牌面
// 牌的長相全部在這個檔案：要換花色圖案、牌背，只改這裡，不用動 index.html 和 pm-core.js。
// 對外只有一個函式：pmRenderCard(card, faceUp) → 回傳一個 .card-view 元素。
//   card = { id, suit:'S'|'H'|'D'|'C', rank:1–13 }；faceUp 為 false 時畫牌背（card 可以是 null）。
// 版面規定：左上角一定要有清楚的數字和花色（手牌重疊時只看得到左上角）。
// 牌的寬高由 CSS 變數 --card-w / --card-h 決定，圖案請用相對大小。
(function (root) {
  'use strict';

  // 中央的動物圖案（黑桃三花貓、紅心秋田犬、方塊企鵝、梅花無尾熊），J 戴帽子、Q K 戴皇冠
  function pmMascotSvg(suit, rank) {
    const isJ = rank === 11;
    const isQ = rank === 12;
    const isK = rank === 13;
    const hasCrown = isQ || isK;
    const hasCap = isJ;

    let crownSvg = '';
    if (hasCrown) {
      crownSvg = `
        <g transform="translate(20, ${isK ? 2 : 4}) scale(0.38)">
          <polygon points="0,28 8,4 16,18 32,0 48,18 56,4 64,28" fill="#f59e0b" stroke="#b45309" stroke-width="2"/>
          <rect x="0" y="26" width="64" height="6" rx="2" fill="#d97706"/>
          <circle cx="8" cy="4" r="2.5" fill="#ef4444"/>
          <circle cx="32" cy="0" r="3" fill="#3b82f6"/>
          <circle cx="56" cy="4" r="2.5" fill="#ef4444"/>
        </g>
      `;
    } else if (hasCap) {
      crownSvg = `
        <g transform="translate(18, 4) scale(0.42)">
          <ellipse cx="32" cy="20" rx="22" ry="8" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2"/>
          <path d="M14,20 Q32,0 50,20 Z" fill="#2563eb"/>
          <path d="M46,16 Q58,2 50,0 Q44,8 46,16 Z" fill="#ef4444"/>
        </g>
      `;
    }

    if (suit === 'S') {
      // 黑桃：三花貓 (Calico Cat)
      return `
        <svg class="mascot-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="12,24 17,7 28,19" fill="#f97316"/>
          <polygon points="14,22 18,11 26,18" fill="#fecdd3"/>
          <polygon points="52,24 47,7 36,19" fill="#1e293b"/>
          <polygon points="50,22 46,11 38,18" fill="#fecdd3"/>
          <circle cx="32" cy="35" r="21" fill="#ffffff" stroke="#1e293b" stroke-width="2.2"/>
          <path d="M13,29 Q19,23 25,25 Q21,33 13,35 Z" fill="#fb923c"/>
          <path d="M51,29 Q45,23 39,25 Q43,33 51,35 Z" fill="#475569"/>
          <ellipse cx="23" cy="35" rx="3.5" ry="4.5" fill="#1e293b"/>
          <ellipse cx="41" cy="35" rx="3.5" ry="4.5" fill="#1e293b"/>
          <circle cx="21.5" cy="33.5" r="1.3" fill="#ffffff"/>
          <circle cx="39.5" cy="33.5" r="1.3" fill="#ffffff"/>
          <ellipse cx="17" cy="39" rx="3" ry="1.8" fill="#fda4af" opacity="0.8"/>
          <ellipse cx="47" cy="39" rx="3" ry="1.8" fill="#fda4af" opacity="0.8"/>
          <polygon points="30,38 34,38 32,41" fill="#f43f5e"/>
          <path d="M28,42 Q32,45 32,41 Q32,45 36,42" stroke="#1e293b" stroke-width="1.8" fill="none" stroke-linecap="round"/>
          <line x1="8" y1="37" x2="16" y2="38" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="7" y1="41" x2="16" y2="40" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="56" y1="37" x2="48" y2="38" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="57" y1="41" x2="48" y2="40" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round"/>
          ${crownSvg}
          <g transform="translate(24, 48) scale(0.25)">
            <path d="M32 0 C16 24 0 32 0 46 C0 56 8 64 19 64 C26 64 30 58 32 54 C34 58 38 64 45 64 C56 64 64 56 64 46 C64 32 48 24 32 0 Z" fill="#0f172a"/>
            <path d="M28 50 L24 64 L40 64 L36 50 Z" fill="#0f172a"/>
          </g>
        </svg>
      `;
    } else if (suit === 'H') {
      // 紅心：秋田犬 (Akita Dog)
      return `
        <svg class="mascot-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="12,25 16,6 28,19" fill="#d97706" stroke="#92400e" stroke-width="1.8"/>
          <polygon points="15,22 18,10 26,18" fill="#fecdd3"/>
          <polygon points="52,25 48,6 36,19" fill="#d97706" stroke="#92400e" stroke-width="1.8"/>
          <polygon points="49,22 46,10 38,18" fill="#fecdd3"/>
          <circle cx="32" cy="35" r="21" fill="#f59e0b" stroke="#92400e" stroke-width="2"/>
          <path d="M14,35 Q18,48 32,48 Q46,48 50,35 Q44,28 32,32 Q20,28 14,35 Z" fill="#ffffff"/>
          <ellipse cx="23" cy="26" rx="2.5" ry="1.8" fill="#ffffff"/>
          <ellipse cx="41" cy="26" rx="2.5" ry="1.8" fill="#ffffff"/>
          <ellipse cx="24" cy="32" rx="3.2" ry="4.2" fill="#261005"/>
          <ellipse cx="40" cy="32" rx="3.2" ry="4.2" fill="#261005"/>
          <circle cx="22.5" cy="30.5" r="1.3" fill="#ffffff"/>
          <circle cx="38.5" cy="30.5" r="1.3" fill="#ffffff"/>
          <path d="M29,36 Q32,34 35,36 Q34,40 32,40 Q30,40 29,36 Z" fill="#1e1b18"/>
          <path d="M29,40 Q32,43 35,40" stroke="#1e1b18" stroke-width="1.5" fill="none"/>
          <path d="M29.5,41 Q32,47 34.5,41 Z" fill="#f43f5e"/>
          <ellipse cx="18" cy="38" rx="2.8" ry="1.6" fill="#fca5a5" opacity="0.8"/>
          <ellipse cx="46" cy="38" rx="2.8" ry="1.6" fill="#fca5a5" opacity="0.8"/>
          ${crownSvg}
          <g transform="translate(24, 48) scale(0.25)">
            <path d="M32 58 C10 40 0 28 0 16 C0 7 7 0 16 0 C23 0 29 4 32 10 C35 4 41 0 48 0 C57 0 64 7 64 16 C64 28 54 40 32 58 Z" fill="#dc2626"/>
          </g>
        </svg>
      `;
    } else if (suit === 'D') {
      // 方塊：小企鵝 (Penguin)
      return `
        <svg class="mascot-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="32" cy="34" rx="19" ry="21" fill="#0f172a" stroke="#0284c7" stroke-width="2"/>
          <ellipse cx="11" cy="37" rx="4.5" ry="9" transform="rotate(20 11 37)" fill="#0f172a"/>
          <ellipse cx="53" cy="37" rx="4.5" ry="9" transform="rotate(-20 53 37)" fill="#0f172a"/>
          <ellipse cx="32" cy="36" rx="13.5" ry="16.5" fill="#ffffff"/>
          <ellipse cx="26" cy="29" rx="2.8" ry="3.8" fill="#0f172a"/>
          <ellipse cx="38" cy="29" rx="2.8" ry="3.8" fill="#0f172a"/>
          <circle cx="25" cy="27.5" r="1.1" fill="#ffffff"/>
          <circle cx="37" cy="27.5" r="1.1" fill="#ffffff"/>
          <ellipse cx="20" cy="35" rx="2.8" ry="1.8" fill="#fda4af" opacity="0.85"/>
          <ellipse cx="44" cy="35" rx="2.8" ry="1.8" fill="#fda4af" opacity="0.85"/>
          <polygon points="28,32 36,32 32,38" fill="#f59e0b"/>
          <ellipse cx="26" cy="53" rx="4.5" ry="2.2" fill="#f59e0b"/>
          <ellipse cx="38" cy="53" rx="4.5" ry="2.2" fill="#f59e0b"/>
          ${crownSvg}
          <g transform="translate(25, 43) scale(0.22)">
            <polygon points="32,0 64,32 32,64 0,32" fill="#dc2626"/>
          </g>
        </svg>
      `;
    } else if (suit === 'C') {
      // 梅花：無尾熊 (Koala)
      return `
        <svg class="mascot-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="13" cy="21" r="10.5" fill="#94a3b8" stroke="#475569" stroke-width="1.8"/>
          <circle cx="13" cy="21" r="6.5" fill="#e2e8f0"/>
          <circle cx="51" cy="21" r="10.5" fill="#94a3b8" stroke="#475569" stroke-width="1.8"/>
          <circle cx="51" cy="21" r="6.5" fill="#e2e8f0"/>
          <ellipse cx="32" cy="35" rx="19.5" ry="17.5" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
          <ellipse cx="23" cy="31" rx="3" ry="3.5" fill="#1e293b"/>
          <ellipse cx="41" cy="31" rx="3" ry="3.5" fill="#1e293b"/>
          <circle cx="21.8" cy="29.5" r="1" fill="#ffffff"/>
          <circle cx="39.8" cy="29.5" r="1" fill="#ffffff"/>
          <ellipse cx="18" cy="37" rx="2.5" ry="1.6" fill="#fca5a5" opacity="0.7"/>
          <ellipse cx="46" cy="37" rx="2.5" ry="1.6" fill="#fca5a5" opacity="0.7"/>
          <ellipse cx="32" cy="37" rx="5.2" ry="7.2" fill="#1e293b"/>
          <ellipse cx="30.5" cy="34.5" rx="1.3" ry="2.2" fill="#475569" opacity="0.6"/>
          <path d="M29,46 Q32,48 35,46" stroke="#1e293b" stroke-width="1.8" fill="none" stroke-linecap="round"/>
          ${crownSvg}
          <g transform="translate(24, 48) scale(0.24)">
            <circle cx="32" cy="22" r="14" fill="#0f172a"/>
            <circle cx="18" cy="38" r="14" fill="#0f172a"/>
            <circle cx="46" cy="38" r="14" fill="#0f172a"/>
            <path d="M28 40 L22 60 L42 60 L36 40 Z" fill="#0f172a"/>
          </g>
        </svg>
      `;
    }
    return '';
  }

  function pmRenderCard(card, faceUp) {
    const view = document.createElement('div');
    view.className = 'card-view';
    if (card) view.dataset.cardId = String(card.id);
    if (faceUp === false || !card) {
      view.classList.add('is-back');
      view.innerHTML = '<div class="card-back"><div class="card-back-frame"><span class="card-back-paw">🐾</span></div></div>';
      return view;
    }
    const suit = pmSuit(card.suit);
    const label = pmLabel(card);
    const corner = '<span class="card-label">' + label + '</span><span class="card-suit-sym">' + suit.symbol + '</span>';
    view.innerHTML =
      '<div class="card-front color-' + suit.color + '">' +
        '<div class="card-corner corner-tl">' + corner + '</div>' +
        '<div class="card-center"><span class="center-watermark">' + suit.symbol + '</span>' + pmMascotSvg(card.suit, card.rank) + '</div>' +
        '<div class="card-corner corner-br">' + corner + '</div>' +
      '</div>';
    return view;
  }

  root.pmRenderCard = pmRenderCard;
})(window);
