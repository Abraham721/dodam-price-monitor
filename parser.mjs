export const SOURCE_URL = 'http://www.wooticket.com/';
const clean = value => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim();
function category(name) {
 if (/기프트 카드/.test(name)) return '기프트카드';
 if (/주유/.test(name)) return '주유';
 if (/도서문화/.test(name)) return '문화·도서';
 if (/영화|CGV/.test(name)) return '영화';
 if (/호텔|리조트|투어|워커힐|국민\s*관광/.test(name)) return '여행·호텔';
 if (/SPC|파리크라상|CJ/.test(name)) return '외식·생활';
 if (/금강|LF|패션/.test(name)) return '패션·제화';
 if (/코스트코|농협하나로|메가마트/.test(name)) return '마트';
 return '백화점';
}
function quote(cell) {
 const text = clean(cell);
 if (/^(?:-|품절|매입불가|판매불가|상담|문의)$/.test(text)) return null;
 const m = text.match(/^([\d,]+)\s*(?:원)?\s*\((\d+(?:\.\d+)?)%\)$/);
 if (!m) throw new Error('Price format changed');
 const price = Number(m[1].replace(/,/g, '')), discount = Number(m[2]);
 if (!Number.isSafeInteger(price) || price <= 0 || discount < 0 || discount >= 100) throw new Error('Invalid price');
 return { price, discount, rate: Math.round((100 - discount) * 100) / 100 };
}
export function parseMarket(html) {
 if (!/우천상품권/.test(html) || !/매입가[\s\S]*판매가/.test(html)) throw new Error('Source layout changed');
 const rows = [], seen = new Set();
 for (const part of html.split(/<tr\b/i).slice(1)) {
  const row = part.split(/<\/tr>/i)[0], id = row.match(/goods_detail\.php\?goodsIdx=(\d+)/)?.[1];
  if (!id) continue;
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
  if (cells.length !== 3 || seen.has(id)) throw new Error('Invalid product row');
  const name = clean(cells[0]), buy = quote(cells[1]), sell = quote(cells[2]);
  const denomination = name.match(/(\d+)\s*(만|천)원/);
  const face = denomination ? Number(denomination[1]) * (denomination[2] === '만' ? 10000 : 1000) : null;
  if (face && [buy, sell].some(q => q && Math.abs(face * q.rate / 100 - q.price) > 2)) throw new Error('Price and denomination mismatch');
  if (!name || name.length > 100 || !buy && !sell) throw new Error('Invalid product');
  rows.push({ id: 'woo-' + id, name, category: category(name), face, buy, sell, sourceUrl: SOURCE_URL + 'goods_detail.php?goodsIdx=' + id });
  seen.add(id);
 }
 if (rows.length < 30 || !rows.some(r => /롯데 상품권.*10만원/.test(r.name)) || !rows.some(r => /신세계 상품권.*10만원/.test(r.name))) throw new Error('Incomplete source');
 return rows;
}
