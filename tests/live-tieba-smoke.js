const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const targetUrl = process.argv[2] || 'https://tieba.baidu.com/p/10888699723?frwh=index';
const htmlFile = process.argv[3] || '';
const repositoryRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repositoryRoot, 'tiebamuoyu.js'), 'utf8');

/**
 * 对公开贴吧帖子执行真实 HTML 冒烟测试，确认 v2 能解析正文图片和生成高清候选。
 * @param {string} url 公开贴吧帖子地址。
 * @returns {Promise<object>} 正文图片数、Excel 图片数和首张图片候选信息。
 * @throws {Error} 页面抓取失败、没有正文图片或 Excel 图片数量不一致时抛出。
 */
async function runLiveSmoke(url, sourceFile = '') {
    let html = '';
    if (sourceFile) {
        html = fs.readFileSync(path.resolve(sourceFile), 'utf8');
    } else {
        const response = await fetch(url, {
            headers: { 'user-agent': 'Mozilla/5.0 Codex Tieba Moyu v2 smoke test' }
        });
        if (!response.ok) throw new Error(`贴吧页面请求失败: HTTP ${response.status}`);
        html = await response.text();
    }
    html = html.replace(/<!--/g, '').replace(/-->/g, '');
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    const values = new Map([
        ['tb__rt_excelMode', 'true'],
        ['tb__rt_hideImage', 'false'],
        ['tb__setting', JSON.stringify({ hideAvatar: true })]
    ]);

    window.GM_getValue = key => values.get(key);
    window.GM_setValue = (key, value) => values.set(key, value);
    window.GM_deleteValue = key => values.delete(key);
    window.GM_addStyle = () => {};
    window.GM_registerMenuCommand = () => {};
    window.unsafeWindow = window;
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.requestAnimationFrame = () => 0;
    window.setInterval = () => 0;
    window.clearInterval = () => {};
    window.IntersectionObserver = class { observe() {} disconnect() {} };
    window.CSS = window.CSS || {};
    window.CSS.escape = window.CSS.escape || (value => String(value));
    window.eval(scriptSource);

    const sourceImages = window.document.querySelectorAll('.d_post_content img.BDE_Image').length;
    const excelImages = window.document.querySelectorAll('#tb__excel_content .tb__excel-img');
    if (sourceImages === 0) throw new Error('真实帖子没有抓取到正文图片');
    if (excelImages.length !== sourceImages) {
        throw new Error(`图片数量不一致: 页面 ${sourceImages}, Excel ${excelImages.length}`);
    }

    const firstImage = excelImages[0];
    const candidates = JSON.parse(firstImage.dataset.originalCandidates || '[]');
    if (!candidates.some(candidate => candidate.includes('/forum/pic/item/'))) {
        throw new Error('没有生成贴吧原图候选地址');
    }

    const mainAvatar = window.document.querySelector('.p_author_face');
    const floorAvatar = window.document.querySelector('.lzl_single_post > .lzl_p_p');
    const mainAvatarHidden = mainAvatar ? window.getComputedStyle(mainAvatar).display === 'none' : false;
    const floorAvatarHidden = floorAvatar ? window.getComputedStyle(floorAvatar).display === 'none' : false;
    if (!mainAvatarHidden || !floorAvatarHidden) {
        throw new Error(`头像隐藏不完整: 主楼 ${mainAvatarHidden}, 楼中楼 ${floorAvatarHidden}`);
    }

    dom.window.close();
    return {
        url,
        sourceImages,
        excelImages: excelImages.length,
        preview: firstImage.src,
        candidates,
        mainAvatarHidden,
        floorAvatarHidden
    };
}

runLiveSmoke(targetUrl, htmlFile)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
