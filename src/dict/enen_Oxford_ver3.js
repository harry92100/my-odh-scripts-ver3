/* global api */
class encn_Oxford {
    constructor(options) {
        this.options = options;
        this.maxexample = 2; // Số lượng câu ví dụ tối đa hiển thị xem trước trên Popup
        this.word = '';
    }

    // Tên hiển thị trong danh sách lựa chọn của ODH
    async displayName() {
        return 'Oxford EN-EN Dictionary ver3';
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

            // 4. Loại từ chung (POS)
            let mainPos = doc.querySelector('.pos')?.textContent || '';

            // 5. Bóc tách từng Nét nghĩa (Sense) thành các đối tượng độc lập
            let senses = doc.querySelectorAll('.sense');
            let entries = [];

            senses.forEach((sense) => {
                let defText = sense.querySelector('.def')?.textContent;
                if (!defText) return;

                // Lấy thông tin đếm được / không đếm được ([C], [U], [C, U]...) từ thẻ .grammar
                let grammar = sense.querySelector('.grammar')?.textContent || '';
                
                // Ghép [Loại từ] + [Tính đếm được]
                let posInfo = mainPos;
                if (grammar) {
                    posInfo += ` ${grammar}`;
                }
                let posHtml = posInfo ? `<span class="pos">${posInfo.trim()}</span>` : '';

                // Hàm in đậm từ cần tra trong câu ví dụ
                let highlightWord = (text) => {
                    let reg = new RegExp(`\\b${word}\\b`, 'gi');
                    return text.replace(reg, `<b>$&</b>`);
                };

                let allExamples = sense.querySelectorAll('.examples .x');
                let allExListHtml = '';
                let previewExListHtml = '';

                allExamples.forEach((ex, exIdx) => {
                    let exText = highlightWord(ex.textContent.trim());
                    let itemHtml = `<li class='sent'><span class='eng_sent'>${exText}</span></li>`;

                    // Gom TOÀN BỘ ví dụ để đẩy sang Anki (ExtraInfo)
                    allExListHtml += itemHtml;

                    // Chỉ lấy 1–2 ví dụ đầu tiên để xem trước trên Popup ODH
                    if (exIdx < this.maxexample) {
                        previewExListHtml += itemHtml;
                    }
                });

                // Khối giao diện xem trước trên Pop-up (Gồm Nghĩa + 1-2 Ví dụ bên dưới)
                let previewExamplesBlock = previewExListHtml ? `<ul class="sents">${previewExListHtml}</ul>` : '';
                let defBlock = `<div>${posHtml}<span class='tran'><span class='eng_tran'>${defText.trim()}</span></span>${previewExamplesBlock}</div>`;

                // Khối toàn bộ ví dụ đưa sang Anki
                let extrainfo = allExListHtml ? `<ul class="sents">${allExListHtml}</ul>` : '';

                // Trả về từng nét nghĩa độc lập
                entries.push({
                    css: encn_Oxford.renderCSS(),
                    expression,
                    reading,
                    definitions: [defBlock], // Định nghĩa chứa preview rút gọn cho Pop-up
                    audios,
                    extrainfo                // Trường chứa 100% ví dụ của riêng nghĩa này
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
