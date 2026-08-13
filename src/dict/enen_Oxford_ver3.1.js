/* global api */
class encn_Oxford {
    constructor(options) {
        this.options = options;
        this.maxexample = 2; // Số câu ví dụ xem trước trên Popup ODH
        this.word = '';
    }

    // Tên hiển thị trong mục Selected Dict. của ODH
    async displayName() {
        return 'Oxford EN-EN Dictionary ver3.1';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample || 2;
    }

    async findTerm(word) {
        this.word = word;
        let deflection = await api.deinflect(word) || [];
        let promises = [word, ...deflection].map(x => this.findOxford(x));
        let results = await Promise.all(promises);
        return [].concat(...results).filter(x => x);
    }

    async findOxford(word) {
        if (!word) return [];

        let cleanWord = word.trim().toLowerCase().replace(/\s+/g, '-');
        let dicturl = `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(cleanWord)}`;

        try {
            let html = await api.fetch(dicturl);
            if (!html) return [];

            let parser = new DOMParser();
            let doc = parser.parseFromString(html, 'text/html');

            let entry = doc.querySelector('.webtop-g') || doc.querySelector('.top-g');
            if (!entry) return [];

            // 1. Từ vựng
            let expression = doc.querySelector('.headword')?.textContent || word;

            // 2. Phiên âm UK / US
            let phUk = doc.querySelector('.phons_br .phon')?.textContent || '';
            let phUs = doc.querySelector('.phons_n_am .phon')?.textContent || '';
            let reading = '';
            if (phUk || phUs) {
                reading = `UK ${phUk}  US ${phUs}`.trim();
            }

            // 3. File âm thanh Audio MP3
            let audios = [];
            let ukAudioEl = doc.querySelector('.phons_br .audio_play_button');
            let usAudioEl = doc.querySelector('.phons_n_am .audio_play_button');
            
            if (ukAudioEl && ukAudioEl.getAttribute('data-src-mp3')) {
                audios.push(ukAudioEl.getAttribute('data-src-mp3'));
            }
            if (usAudioEl && usAudioEl.getAttribute('data-src-mp3')) {
                audios.push(usAudioEl.getAttribute('data-src-mp3'));
            }

            // 4. Loại từ chính (POS)
            let mainPos = doc.querySelector('.pos')?.textContent || '';

            // Hàm chuẩn hóa & viết tắt thuộc tính grammar/countability (Countable -> [C], Uncountable -> [U]...)
            let formatGrammar = (str) => {
                if (!str) return '';
                let formatted = str.trim()
                    .replace(/\bcountable\b/gi, 'C')
                    .replace(/\buncountable\b/gi, 'U')
                    .replace(/\bsingular\b/gi, 'sing.')
                    .replace(/\bplural\b/gi, 'pl.');
                if (!formatted.startsWith('[')) formatted = '[' + formatted;
                if (!formatted.endsWith(']')) formatted = formatted + ']';
                return formatted;
            };

            // Hàm in đậm từ cần tra trong câu ví dụ
            let highlightWord = (text) => {
                let reg = new RegExp(`\\b${word}\\b`, 'gi');
                return text.replace(reg, `<b>$&</b>`);
            };

            // 5. Bóc tách từng Nét nghĩa (Sense) thành các đối tượng độc lập
            let senses = doc.querySelectorAll('.sense');
            let entries = [];

            senses.forEach((sense) => {
                let defText = sense.querySelector('.def')?.textContent;
                if (!defText) return;

                // Lấy thông tin đếm được / không đếm được từ nhiều vị trí có thể có trên Oxford
                let grammarEl = sense.querySelector('.grammar') || 
                                sense.querySelector('.sensetop .grammar') ||
                                sense.querySelector('.grammar-g');
                let grammarText = grammarEl ? grammarEl.textContent.trim() : '';
                let formattedGrammar = formatGrammar(grammarText);

                // Ghép [Loại từ] + [Viết tắt đếm được]
                let posInfo = mainPos;
                if (formattedGrammar) {
                    posInfo += ` ${formattedGrammar}`;
                }
                let posHtml = posInfo ? `<span class="pos">${posInfo.trim()}</span>` : '';

                // Bóc tách câu ví dụ
                let allExamples = sense.querySelectorAll('.examples .x');
                let allExListHtml = '';
                let previewExListHtml = '';

                allExamples.forEach((ex, exIdx) => {
                    let exText = highlightWord(ex.textContent.trim());
                    let itemHtml = `<li class='sent'><span class='eng_sent'>${exText}</span></li>`;

                    // Gom 100% ví dụ dành cho Anki ExtraInfo
                    allExListHtml += itemHtml;

                    // Chỉ lấy tối đa 1-2 ví dụ cho Popup ODH
                    if (exIdx < this.maxexample) {
                        previewExListHtml += itemHtml;
                    }
                });

                // Khối giao diện xem trước trên Pop-up ODH (Chỉ chứa 1-2 ví dụ)
                let previewExamplesBlock = previewExListHtml 
                    ? `<div class="odh-preview-only"><ul class="sents">${previewExListHtml}</ul></div>` 
                    : '';
                
                let defBlock = `<div>${posHtml}<span class='tran'><span class='eng_tran'>${defText.trim()}</span></span>${previewExamplesBlock}</div>`;

                // Khối chứa TOÀN BỘ ví dụ dành cho Anki (Bọc trong .odh-extra để triệt tiêu hiển thị trên Popup)
                let extrainfo = allExListHtml 
                    ? `<div class="odh-extra"><ul class="sents">${allExListHtml}</ul></div>` 
                    : '';

                entries.push({
                    css: encn_Oxford.renderCSS(),
                    expression,
                    reading,
                    definitions: [defBlock],
                    audios,
                    extrainfo
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
                /* Triệt tiêu khối extrainfo tràn màn hình ở phía trên cùng Pop-up ODH */
                .odh-extra { display: none !important; }

                div.dis {font-weight: bold; margin-bottom:3px; padding:0;}
                span.pos {text-transform:lowercase; font-size:0.85em; margin-right:5px; padding:2px 6px; color:white; background-color:#0d47a1; border-radius:3px; font-weight:normal; display:inline-block;}
                span.tran {margin:0; padding:0; line-height:1.4;}
                span.eng_tran {margin-right:3px; padding:0; color:#222; font-weight:500;}
                ul.sents {font-size:0.9em; list-style:square inside; margin:6px 0 4px 0; padding:6px 10px; background:rgba(13,71,161,0.06); border-radius:4px;}
                li.sent {margin:3px 0; padding:0; color:#444;}
                span.eng_sent {margin-right:5px;}
                li.sent b {color: #0d47a1;}
            </style>`;
    }
}
