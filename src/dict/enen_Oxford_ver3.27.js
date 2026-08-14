/* global api */
class encn_Oxford {
    constructor(options) {
        this.options = options;
        this.word = '';
    }

    async displayName() {
        return 'Oxford EN-EN Dictionary ver3.27 (Multi-POS & Verb-Form Support)';
    }

    setOptions(options) {
        this.options = options;
    }

    // BỘ CHUYỂN ĐỔI TỪ GỐC TIẾNG ANH (Hỗ trợ cả Động từ Quy tắc & Bất quy tắc)
    getEnglishLemmas(word) {
        let w = word.trim().toLowerCase();
        let candidates = [w];

        // BẢNG TRA CỨU ĐỘNG TỪ BẤT QUY TẮC (Past Simple & Past Participle)
        const irregularVerbs = {
            "went": "go", "gone": "go",
            "swam": "swim", "swum": "swim",
            "wrote": "write", "written": "write",
            "drove": "drive", "driven": "drive",
            "broke": "break", "broken": "break",
            "took": "take", "taken": "take",
            "gave": "give", "given": "give",
            "saw": "see", "seen": "see",
            "ate": "eat", "eaten": "eat",
            "spoke": "speak", "spoken": "speak",
            "chose": "choose", "chosen": "choose",
            "ran": "run",
            "came": "come",
            "began": "begin", "begun": "begin",
            "forgot": "forget", "forgotten": "forget",
            "got": "get", "gotten": "get",
            "bought": "buy",
            "thought": "think",
            "taught": "teach",
            "caught": "catch",
            "brought": "bring",
            "built": "build",
            "felt": "feel",
            "left": "leave",
            "lost": "lose",
            "meant": "mean",
            "paid": "pay",
            "said": "say",
            "sold": "sell",
            "sent": "send",
            "slept": "sleep",
            "spent": "spend",
            "stood": "stand",
            "told": "tell",
            "understood": "understand",
            "won": "win",
            "wore": "wear", "worn": "wear",
            "flew": "fly", "flown": "fly",
            "drew": "draw", "drawn": "draw",
            "grew": "grow", "grown": "grow",
            "knew": "know", "known": "know",
            "threw": "throw", "thrown": "throw",
            "blew": "blow", "blown": "blow",
            "sang": "sing", "sung": "sing",
            "rang": "ring", "rung": "ring",
            "sank": "sink", "sunk": "sink",
            "drank": "drink", "drunk": "drink",
            "became": "become",
            "bent": "bend",
            "bit": "bite", "bitten": "bite",
            "bled": "bleed",
            "bound": "bind",
            "fed": "feed",
            "fought": "fight",
            "found": "find",
            "froze": "freeze", "frozen": "freeze",
            "hung": "hang",
            "hid": "hide", "hidden": "hide",
            "held": "hold",
            "kept": "keep",
            "laid": "lay",
            "led": "lead",
            "met": "meet", "ridden": "ride", "rode": "ride",
            "rose": "rise", "risen": "rise",
            "shook": "shake", "shaken": "shake",
            "shot": "shoot",
            "stole": "steal", "stolen": "steal",
            "swore": "swear", "sworn": "swear",
            "tore": "tear", "torn": "tear"
        };

        if (irregularVerbs[w]) {
            candidates.push(irregularVerbs[w]);
        }

        // Xử lý đuôi -ing (debating -> debate, running -> run, playing -> play)
        if (w.endsWith('ing') && w.length > 4) {
            let base = w.slice(0, -3);
            candidates.push(base);
            candidates.push(base + 'e');
            if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
                candidates.push(base.slice(0, -1));
            }
        }

        // Xử lý đuôi -ed (played -> play, studied -> study, debated -> debate)
        if (w.endsWith('ed') && w.length > 3) {
            let base = w.slice(0, -2);
            candidates.push(base);
            candidates.push(base + 'e');
            if (w.endsWith('ied')) {
                candidates.push(w.slice(0, -3) + 'y');
            }
            if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
                candidates.push(base.slice(0, -1));
            }
        }

        // Xử lý đuôi -s / -es / -ies (cats -> cat, boxes -> box, studies -> study)
        if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) {
            if (w.endsWith('ies')) {
                candidates.push(w.slice(0, -3) + 'y');
            } else if (w.endsWith('es')) {
                candidates.push(w.slice(0, -2));
                candidates.push(w.slice(0, -1));
            } else {
                candidates.push(w.slice(0, -1));
            }
        }

        return Array.from(new Set(candidates));
    }

    async findTerm(word) {
        this.word = word;
        
        let odhDeflection = await api.deinflect(word) || [];
        let autoLemmas = this.getEnglishLemmas(word);
        let rawCandidates = [word, ...autoLemmas, ...odhDeflection];
        
        let cleanWordStr = word.trim();
        if (cleanWordStr.length > 2) {
            rawCandidates = rawCandidates.filter(x => x && x.trim().length > 1);
        }

        let searchList = Array.from(new Set(rawCandidates));

        // Tải dữ liệu song song cho TẤT CẢ các dạng từ (ví dụ cả 'discouraged' và 'discourage')
        let promises = searchList.map(x => this.findOxford(x));
        let results = await Promise.all(promises);
        
        let validResults = results.filter(r => r && r.length > 0);
        if (validResults.length === 0) return [];

        // Gộp toàn bộ nét nghĩa của TẤT CẢ các từ loại (Tính từ + Động từ)
        let combinedEntries = [].concat(...validResults);

        // Lọc trùng lặp entry nếu các từ tìm kiếm trả về trùng trang
        let uniqueEntries = [];
        let seenDefs = new Set();

        combinedEntries.forEach(entry => {
            let signature = (entry.expression + '|' + (entry.definitions ? entry.definitions[0] : '')).trim();
            if (!seenDefs.has(signature)) {
                seenDefs.add(signature);
                uniqueEntries.push(entry);
            }
        });

        return uniqueEntries;
    }

    async fetchDocument(url) {
        try {
            let html = await api.fetch(url);
            if (!html) return null;

            let parser = new DOMParser();
            let doc = parser.parseFromString(html, 'text/html');
            let entry = doc.querySelector('.webtop-g') || doc.querySelector('.top-g') || doc.querySelector('.entry');
            if (entry) return doc;
            return null;
        } catch (e) {
            return null;
        }
    }

    async findOxford(word) {
        if (!word) return [];

        let cleanWord = word.trim().toLowerCase().replace(/\s+/g, '-');
        let baseUrl = `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(cleanWord)}`;
        let fallbackUrl = `${baseUrl}_1`;

        let docs = await Promise.all([this.fetchDocument(baseUrl), this.fetchDocument(fallbackUrl)]);
        let doc = docs[0] || docs[1];

        if (!doc) return [];

        try {
            // 1. Từ vựng chính & Phiên âm UK / US
            let expression = doc.querySelector('.headword')?.textContent || word;
            let phUk = doc.querySelector('.phons_br .phon')?.textContent || '';
            let phUs = doc.querySelector('.phons_n_am .phon')?.textContent || '';
            let reading = '';
            if (phUk || phUs) {
                reading = `UK ${phUk}  US ${phUs}`.trim();
            }

            // 2. Audio MP3
            let audios = [];
            let ukAudioEl = doc.querySelector('.phons_br .audio_play_button');
            let usAudioEl = doc.querySelector('.phons_n_am .audio_play_button');
            if (ukAudioEl && ukAudioEl.getAttribute('data-src-mp3')) {
                audios.push(ukAudioEl.getAttribute('data-src-mp3'));
            }
            if (usAudioEl && usAudioEl.getAttribute('data-src-mp3')) {
                audios.push(usAudioEl.getAttribute('data-src-mp3'));
            }

            // 3. Loại từ chính & Ngữ pháp
            let mainPos = doc.querySelector('.pos')?.textContent || '';
            let topGrammarEl = doc.querySelector('.webtop-g .grammar') || 
                               doc.querySelector('.top-g .grammar') || 
                               doc.querySelector('.pos + .grammar');
            let topGrammarText = topGrammarEl ? topGrammarEl.textContent.trim() : '';

            let formatGrammar = (str) => {
                if (!str) return '';
                let clean = str.replace(/\[/g, '').replace(/\]/g, '').trim();
                if (/countable,\s*uncountable/i.test(clean) || /uncountable,\s*countable/i.test(clean)) {
                    return '[C, U]';
                }
                let formatted = clean
                    .replace(/\bcountable\b/gi, 'C')
                    .replace(/\buncountable\b/gi, 'U')
                    .replace(/\bsingular\b/gi, 'sing.')
                    .replace(/\bplural\b/gi, 'pl.');
                return `[${formatted}]`;
            };

            let escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let highlightWord = (text) => {
                let reg = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
                return text.replace(reg, `<b>$&</b>`);
            };

            let isInsideIdiom = (el) => {
                let p = el.parentElement;
                while (p) {
                    if (p.classList && p.classList.contains('idm-g')) return true;
                    p = p.parentElement;
                }
                return false;
            };

            let extractExamples = (container) => {
                let exampleLiEls = container.querySelectorAll('.examples > li, .examples li');
                let exListHtml = '';

                if (exampleLiEls.length > 0) {
                    exampleLiEls.forEach((li) => {
                        let cfEl = li.querySelector('.cf, .labels');
                        let cfText = cfEl ? cfEl.textContent.trim() : '';

                        let exEl = li.querySelector('.x');
                        let exText = exEl ? highlightWord(exEl.textContent.trim()) : '';

                        let fullExHtml = '';
                        if (cfText && exText) {
                            fullExHtml = `<strong class="cf-prefix">${cfText}</strong> ${exText}`;
                        } else if (cfText && !exText) {
                            fullExHtml = `<strong class="cf-prefix">${cfText}</strong>`;
                        } else {
                            fullExHtml = exText;
                        }

                        if (fullExHtml) {
                            exListHtml += `<li class='sent'><span class='eng_sent'>${fullExHtml}</span></li>`;
                        }
                    });
                } else {
                    let examples = Array.from(container.querySelectorAll('.examples .x'));
                    examples.forEach((ex) => {
                        let exText = highlightWord(ex.textContent.trim());
                        exListHtml += `<li class='sent'><span class='eng_sent'>${exText}</span></li>`;
                    });
                }
                return exListHtml;
            };

            let entries = [];

            // --- A. BÓC TÁCH NÉT NGHĨA THƯỜNG (SENSES) ---
            let allSenses = Array.from(doc.querySelectorAll('.sense'));
            let regularSenses = allSenses.filter(s => !isInsideIdiom(s));

            regularSenses.forEach((sense) => {
                let defText = sense.querySelector('.def')?.textContent;
                if (!defText) return;

                let senseGrammarEl = sense.querySelector('.grammar') || 
                                     sense.querySelector('.sensetop .grammar') ||
                                     sense.querySelector('.grammar-g');
                let grammarText = senseGrammarEl ? senseGrammarEl.textContent.trim() : topGrammarText;
                let formattedGrammar = formatGrammar(grammarText);

                let posInfo = mainPos;
                if (formattedGrammar) {
                    posInfo += ` ${formattedGrammar}`;
                }
                let posHtml = posInfo ? `<span class="pos">${posInfo.trim()}</span>` : '';

                let exListHtml = extractExamples(sense);

                let defBlock = `<div class="odh-def-box">${posHtml}<span class='tran'><span class='eng_tran'>${defText.trim()}</span></span></div>`;
                let extrainfoBlock = exListHtml 
                    ? `<div class="odh-extra"><ul class="sents">${exListHtml}</ul></div>` 
                    : '';

                entries.push({
                    css: encn_Oxford.renderCSS(),
                    expression: expression,
                    reading: reading,
                    definitions: [defBlock],
                    extrainfo: extrainfoBlock,
                    audios: audios
                });
            });

            // --- B. BÓC TÁCH KHỐI THÀNH NGỮ (IDIOMS) ---
            let idiomGroups = doc.querySelectorAll('.idm-g');
            idiomGroups.forEach((idmGroup) => {
                let idmTitle = idmGroup.querySelector('.idm')?.textContent?.trim();
                let idmSenses = idmGroup.querySelectorAll('.sense');

                idmSenses.forEach((sense) => {
                    let defText = sense.querySelector('.def')?.textContent;
                    if (!defText) return;

                    let posHtml = `<span class="pos idiom-tag">idiom</span>`;
                    if (idmTitle) {
                        posHtml += `<strong class="idm-title">${idmTitle}</strong>`;
                    }

                    let exListHtml = extractExamples(sense);

                    let defBlock = `<div class="odh-def-box">${posHtml} <span class='tran'><span class='eng_tran'>${defText.trim()}</span></span></div>`;
                    let extrainfoBlock = exListHtml 
                        ? `<div class="odh-extra"><ul class="sents">${exListHtml}</ul></div>` 
                        : '';

                    entries.push({
                        css: encn_Oxford.renderCSS(),
                        expression: expression,
                        reading: reading,
                        definitions: [defBlock],
                        extrainfo: extrainfoBlock,
                        audios: audios
                    });
                });
            });

            return entries;

        } catch (err) {
            return [];
        }
    }

    static renderCSS() {
        return `
            <style>
                body, html, #popup, .popup, .dict-content, .dict-item, .item, .entry, .odh-entry, .odh-item, [class*="item"], [class*="entry"] {
                    display: flex !important;
                    flex-direction: column !important;
                }

                .expression, .reading, .phonetic, .audios, .header, .head, [class*="header"], [class*="head"] {
                    order: 0 !important;
                }

                .definitions, .odh-definitions, .definition, [class*="definition"], [class*="def"] {
                    order: 1 !important;
                    margin-bottom: 4px !important;
                }

                .extrainfo, .odh-extrainfo, .extra_info, .extra, .notes, [class*="extrainfo"], [class*="extra"] {
                    order: 2 !important;
                    margin-top: 4px !important;
                    margin-bottom: 8px !important;
                }

                /* CHỈ ẨN TỪ DÒNG THỨ 3 TRÊN POPUP CỦA TRÌNH DUYỆT */
                #popup .odh-extra ul.sents li.sent:nth-child(n+3),
                .popup .odh-extra ul.sents li.sent:nth-child(n+3),
                .dict-content .odh-extra ul.sents li.sent:nth-child(n+3) {
                    display: none !important;
                }

                span.pos {
                    font-size: 0.85em !important;
                    margin-right: 6px !important;
                    padding: 2px 6px !important;
                    color: #ffffff !important;
                    background-color: #0d47a1 !important;
                    border-radius: 3px !important;
                    font-weight: bold !important;
                    display: inline-block !important;
                    text-transform: none !important;
                }
                span.pos.idiom-tag {
                    background-color: #e65100 !important;
                }
                strong.idm-title {
                    color: #b71c1c !important;
                    font-weight: bold !important;
                    margin-right: 6px !important;
                }
                strong.cf-prefix {
                    color: #1a237e !important;
                    font-weight: bold !important;
                    margin-right: 6px !important;
                }
                span.eng_tran {
                    color: #222222 !important;
                    font-weight: 500 !important;
                }
                ul.sents {
                    font-size: 0.9em !important;
                    list-style: square inside !important;
                    margin: 4px 0 !important;
                    padding: 6px 10px !important;
                    background: #f0f4f9 !important;
                    border-radius: 4px !important;
                    border-left: 3px solid #0d47a1 !important;
                }
                li.sent {
                    margin: 3px 0 !important;
                    padding: 0 !important;
                    color: #333333 !important;
                }
                span.eng_sent {
                    margin-right: 5px !important;
                }
                li.sent b {
                    color: #0d47a1 !important;
                    font-weight: bold !important;
                }
            </style>`;
    }
}
