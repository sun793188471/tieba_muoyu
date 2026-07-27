const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repositoryRoot, 'tiebamuoyu.js'), 'utf8');

function fixture(name) {
    return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function createEnvironment({ html, url, values = {}, fetchHtml = '', beforeEval } = {}) {
    const dom = new JSDOM(html || fixture('home.html'), {
        url: url || 'https://tieba.baidu.com/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const { window } = dom;
    const store = new Map(Object.entries(values));
    const menuCommands = new Map();
    const errors = [];

    window.GM_getValue = key => store.get(key);
    window.GM_setValue = (key, value) => store.set(key, value);
    window.GM_deleteValue = key => store.delete(key);
    window.GM_addStyle = () => {};
    window.GM_registerMenuCommand = (label, handler) => menuCommands.set(label, handler);
    window.unsafeWindow = window;
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.requestAnimationFrame = () => 0;
    window.setInterval = () => 0;
    window.clearInterval = () => {};
    window.fetch = async () => ({ ok: true, text: async () => fetchHtml });
    window.IntersectionObserver = class {
        observe() {}
        disconnect() {}
    };
    window.CSS = window.CSS || {};
    window.CSS.escape = window.CSS.escape || (value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'));
    window.console.error = (...args) => errors.push(args.map(String).join(' '));
    beforeEval?.(window);

    window.eval(scriptSource);

    return {
        dom,
        window,
        document: window.document,
        store,
        menuCommands,
        errors,
        close: () => window.close()
    };
}

test('帖子列表 Excel 模式能够渲染回复数且不读写全局 reply', t => {
    const env = createEnvironment({
        html: fixture('threads.html'),
        url: 'https://tieba.baidu.com/f?kw=测试吧',
        values: { tb__rt_excelMode: 'true' }
    });
    t.after(env.close);

    assert.equal(Object.prototype.hasOwnProperty.call(env.window, 'reply'), false);
    assert.match(env.document.querySelector('#tb__excel_content')?.textContent || '', /12/);
});

test('帖子列表 Excel 模式采集吧页图片并优先保存 bpic 原图', t => {
    const env = createEnvironment({
        html: fixture('threads.html'),
        url: 'https://tieba.baidu.com/f?kw=测试吧',
        values: { tb__rt_excelMode: 'true' }
    });
    t.after(env.close);

    const image = env.document.querySelector('#tb__excel_content .tb__excel-img');
    assert.ok(image);
    assert.match(image.src, /wh%3D119%2C90/);
    assert.equal(
        JSON.parse(image.dataset.originalCandidates)[0],
        'https://tiebapic.baidu.com/forum/pic/item/hash-thread.jpg'
    );
});

test('帖子列表图片使用 data-original 而不是贴吧 icon 占位图', t => {
    const html = fixture('threads.html').replace(
        'src="https://tiebapic.baidu.com/forum/wh%3D119%2C90/sign=test/hash-thread.jpg"',
        'src="https://tb3.bdstatic.com/public/img/icon_pc_picheader_n.432946a7.png"'
    );
    const env = createEnvironment({
        html,
        url: 'https://tieba.baidu.com/f?kw=测试吧',
        values: { tb__rt_excelMode: 'true' }
    });
    t.after(env.close);

    const image = env.document.querySelector('#tb__excel_content .tb__excel-img');
    assert.ok(image);
    assert.match(image.src, /wh%3D119%2C90/);
    assert.doesNotMatch(image.src, /icon_pc_picheader/);
});

test('Excel 首页切换贴吧 Sheet 会从渲染后 DOM 补齐动态图片', async t => {
    const renderedThreadsHtml = fixture('threads.html');
    const staticThreadsHtml = renderedThreadsHtml.replace(/\s*<div class="threadlist_media">[\s\S]*?<\/div>/, '');
    let renderFrameCount = 0;
    let renderFrameUrl = '';
    const env = createEnvironment({
        html: fixture('home.html'),
        values: {
            tb__rt_excelMode: 'true',
            tb__rt_hideImage: 'true'
        },
        fetchHtml: staticThreadsHtml,
        beforeEval: window => {
            const appendChild = window.Element.prototype.appendChild;
            window.Element.prototype.appendChild = function appendRenderedForumFrame(child) {
                const result = appendChild.call(this, child);
                if (child.matches?.('iframe.tb__forum-render-frame')) {
                    renderFrameCount += 1;
                    renderFrameUrl = child.src;
                    child.contentDocument.open();
                    child.contentDocument.write(renderedThreadsHtml);
                    child.contentDocument.close();
                    window.setTimeout(() => child.dispatchEvent(new window.Event('load')), 0);
                }
                return result;
            };
        }
    });
    t.after(env.close);

    const forumTab = Array.from(env.document.querySelectorAll('#tb__sheet_tabs .tb__sheet-tab'))
        .find(tab => tab.textContent.includes('测试吧'));
    forumTab.click();
    await new Promise(resolve => env.window.setTimeout(resolve, 100));

    const image = env.document.querySelector('#tb__excel_content .tb__excel-img');
    assert.equal(renderFrameCount, 1);
    assert.equal(new URL(renderFrameUrl).searchParams.get('__tb_moyu_render'), '1');
    assert.equal(env.document.querySelector('.tb__forum-render-frame'), null);
    assert.ok(env.document.body.classList.contains('tb__hide-image'));
    assert.ok(env.document.querySelector('#tb__excel_content .tb__img-tag'));
    assert.ok(image);
    assert.equal(
        JSON.parse(image.dataset.originalCandidates)[0],
        'https://tiebapic.baidu.com/forum/pic/item/hash-thread.jpg'
    );
});

test('frameElement 访问受限时仍能初始化并响应 R 快捷键', t => {
    let env;
    assert.doesNotThrow(() => {
        env = createEnvironment({
            beforeEval: window => {
                Object.defineProperty(window, 'frameElement', {
                    configurable: true,
                    get() {
                        throw new window.DOMException('Blocked by userscript sandbox', 'SecurityError');
                    }
                });
            }
        });
    });
    t.after(() => env?.close());

    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    assert.ok(env.document.querySelector('#tb__excel_overlay.active'));
});

test('R 关闭时展示设置和快捷键不改变贴吧原生页面', t => {
    const env = createEnvironment({
        html: fixture('settings-post.html'),
        url: 'https://tieba.baidu.com/p/30000',
        values: {
            tb__setting: JSON.stringify({
                hideAvatar: true,
                hideImage: true,
                hideHeader: true,
                hideSidebar: true,
                darkMode: true
            })
        },
        beforeEval: window => {
            Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 600 });
        }
    });
    t.after(env.close);

    const managedClasses = [
        'tb__hide-avatar', 'tb__hide-image', 'tb__hide-header',
        'tb__hide-sidebar', 'tb__dark-mode', 'tb__eye-care'
    ];
    managedClasses.forEach(className => assert.equal(env.document.body.classList.contains(className), false));

    ['q', 'e', 'd'].forEach(key => {
        env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key, bubbles: true }));
    });
    managedClasses.forEach(className => assert.equal(env.document.body.classList.contains(className), false));
    assert.equal(env.store.has('tb__rt_hideAvatar'), false);
    assert.equal(env.store.has('tb__rt_hideImage'), false);
    assert.equal(env.store.has('tb__rt_darkMode'), false);
    assert.equal(env.document.querySelector('.tb__quote-folded'), null);
    assert.equal(env.document.querySelector('.tb__author-badge'), null);
    assert.match(env.document.querySelector('.BDE_Image').src, /^data:image/);

    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    assert.ok(env.document.querySelector('#tb__excel_overlay.active'));
    ['tb__hide-avatar', 'tb__hide-image', 'tb__hide-header', 'tb__hide-sidebar', 'tb__dark-mode']
        .forEach(className => assert.ok(env.document.body.classList.contains(className), className));

    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    managedClasses.forEach(className => assert.equal(env.document.body.classList.contains(className), false));
});

test('R 关闭时内容过滤和链接增强不改变贴吧原生列表', t => {
    const env = createEnvironment({
        html: fixture('settings-threads.html'),
        url: 'https://tieba.baidu.com/f?kw=设置测试吧',
        values: {
            tb__keywords: '剧透',
            tb__banlist: JSON.stringify({ 黑名单用户: true })
        }
    });
    t.after(env.close);

    const threads = env.document.querySelectorAll('.j_thread_list');
    assert.notEqual(env.window.getComputedStyle(env.document.querySelector('#mediago-test')).display, 'none');
    assert.equal(threads[0].style.display, '');
    assert.equal(threads[1].style.display, '');
    assert.equal(env.document.querySelector('.j_th_tit').hasAttribute('target'), false);
});

test('异常编码的贴吧链接不会中断 Excel 初始化', t => {
    const env = createEnvironment({
        html: '<!doctype html><html><body><div id="com_userbar"></div><a href="/f?kw=%E4%A">异常吧</a></body></html>',
        values: { tb__rt_excelMode: 'true' }
    });
    t.after(env.close);

    assert.ok(env.document.querySelector('#tb__excel_overlay.active'));
    assert.equal(env.errors.some(error => error.includes('URI malformed')), false);
    assert.match(env.document.querySelector('#tb__sheet_tabs').textContent, /异常吧/);
});

test('Excel 贴吧 Sheet 兼容旧 GBK 编码名称', t => {
    const env = createEnvironment({
        html: '<!doctype html><html><body><div id="com_userbar"></div><a href="/f?kw=%D3%A6%D3%C3%D6%D0%D0%C4">应用中心</a></body></html>',
        values: { tb__rt_excelMode: 'true' },
        beforeEval: window => { window.TextDecoder = global.TextDecoder; }
    });
    t.after(env.close);

    const sheetLabels = Array.from(env.document.querySelectorAll('#tb__sheet_tabs .tb__tab-label'))
        .map(element => element.textContent);
    assert.ok(sheetLabels.includes('应用中心'));
    assert.equal(sheetLabels.some(label => label.includes('�')), false);
});

test('设置面板首次打开后可以导出和导入配置', t => {
    const env = createEnvironment({
        values: {
            tb__keywords: '剧透',
            tb__banlist: JSON.stringify({ 测试用户: true }),
            tb__rt_hideImage: 'true'
        }
    });
    t.after(env.close);

    env.menuCommands.get('贴吧摸鱼设置')();
    const textarea = env.document.querySelector('#tb__backup_text');
    env.document.querySelector('#tb__export_btn').click();
    assert.match(textarea.value, /"normal"/);
    assert.match(textarea.value, /"keywords": "剧透"/);
    assert.match(textarea.value, /"测试用户": true/);
    assert.match(textarea.value, /"tb__rt_hideImage": "true"/);

    textarea.value = JSON.stringify({
        normal: { hideAvatar: true },
        advanced: { fontResize: 16 },
        keywords: '导入关键字',
        banList: { 导入用户: true },
        runtime: { tb__rt_darkMode: true, dangerous: true }
    });
    env.document.querySelector('#tb__import_btn').click();
    assert.equal(JSON.parse(env.store.get('tb__setting')).hideAvatar, true);
    assert.equal(JSON.parse(env.store.get('tb__advanced_setting')).fontResize, 16);
    assert.equal(env.store.get('tb__keywords'), '导入关键字');
    assert.equal(JSON.parse(env.store.get('tb__banlist')).导入用户, true);
    assert.equal(env.store.get('tb__rt_darkMode'), 'true');
    assert.equal(env.store.has('dangerous'), false);
});

test('扩展坞设置按钮首次点击即可创建设置面板', t => {
    const env = createEnvironment();
    t.after(env.close);

    assert.equal(env.document.querySelector('#tb__setting_cover'), null);
    env.document.querySelector('#tb__jump_setting').click();
    assert.equal(env.document.querySelector('#tb__setting_cover')?.style.display, 'flex');
});

test('Excel 模式工具栏可直接呼出基础设置', t => {
    const env = createEnvironment({ values: { tb__rt_excelMode: 'true' } });
    t.after(env.close);

    const settingsButton = env.document.querySelector('#tb__excel_setting');
    assert.ok(settingsButton);
    settingsButton.click();
    assert.equal(env.document.querySelector('#tb__setting_cover')?.style.display, 'flex');
    assert.ok(env.document.querySelector('#tb__section_normal').classList.contains('active'));
});

test('设置面板展示实际状态且保存后清除快捷键覆盖', t => {
    const env = createEnvironment({
        values: {
            tb__rt_hideAvatar: 'false',
            tb__rt_hideImage: 'true'
        }
    });
    t.after(env.close);

    env.menuCommands.get('贴吧摸鱼设置')();
    assert.equal(env.document.querySelector('#tb__cb_hideAvatar').checked, false);
    assert.equal(env.document.querySelector('#tb__cb_hideImage').checked, true);
    env.document.querySelector('#tb__cb_hideAvatar').checked = true;
    env.document.querySelector('#tb__save_btn').click();

    assert.equal(JSON.parse(env.store.get('tb__setting')).hideAvatar, true);
    assert.equal(JSON.parse(env.store.get('tb__setting')).hideImage, true);
    assert.equal(env.store.has('tb__rt_hideAvatar'), false);
    assert.equal(env.store.has('tb__rt_hideImage'), false);
});

test('显式运行时关闭状态优先于基础设置默认开启', t => {
    const env = createEnvironment({
        values: {
            tb__setting: JSON.stringify({ hideImage: true }),
            tb__rt_hideImage: 'false'
        }
    });
    t.after(env.close);

    assert.equal(env.document.body.classList.contains('tb__hide-image'), false);
});

test('Excel 采集帖子正文不会删除原页面楼中楼', t => {
    const env = createEnvironment({
        html: fixture('post-with-images.html'),
        url: 'https://tieba.baidu.com/p/10001',
        values: { tb__rt_excelMode: 'true' }
    });
    t.after(env.close);

    assert.ok(env.document.querySelector('#j_p_postlist .core_reply_wrapper'));
});

test('Excel 表格不会把帖子标题文本重新解释为 HTML', t => {
    const env = createEnvironment({
        html: fixture('threads.html'),
        url: 'https://tieba.baidu.com/f?kw=测试吧',
        values: { tb__rt_excelMode: 'true' },
        beforeEval: window => { window.reply = '0'; }
    });
    t.after(env.close);

    assert.equal(env.document.querySelector('#tb__attack'), null);
    assert.match(env.document.querySelector('#tb__excel_content').textContent, /<img id="tb__attack"/);
});

test('Excel 帖子正文保留链接包裹图片和直接图片', t => {
    const env = createEnvironment({
        html: fixture('post-with-images.html'),
        url: 'https://tieba.baidu.com/p/10001',
        values: { tb__rt_excelMode: 'true' }
    });
    t.after(env.close);

    const images = env.document.querySelectorAll('#tb__excel_content .tb__excel-img');
    assert.equal(images.length, 2);
    assert.equal(env.document.querySelector('#tb__excel_content a[href^="javascript:"]'), null);
    assert.match(env.document.querySelector('#tb__excel_content').textContent, /危险链接/);
});

test('Excel 图片保存高清候选但仍使用压缩图作为表格预览', t => {
    const env = createEnvironment({
        html: fixture('post-with-images.html'),
        url: 'https://tieba.baidu.com/p/10001',
        values: { tb__rt_excelMode: 'true' }
    });
    t.after(env.close);

    const directImage = Array.from(env.document.querySelectorAll('#tb__excel_content .tb__excel-img'))
        .find(image => image.src.includes('hash-direct.jpg'));
    assert.match(directImage.src, /w%3D580/);
    const candidates = JSON.parse(directImage.dataset.originalCandidates);
    assert.equal(candidates[0], 'https://imgsa.baidu.com/forum/pic/item/hash-direct.jpg');
    assert.ok(candidates.includes('https://imgsrc.baidu.com/forum/pic/item/hash-direct.jpg'));
});

test('Excel 帖子链接在当前框架内创建帖子 Sheet', async t => {
    const env = createEnvironment({
        html: fixture('home.html'),
        values: { tb__rt_excelMode: 'true' },
        fetchHtml: fixture('post-with-images.html')
    });
    t.after(env.close);

    const link = env.document.querySelector('#tb__excel_content a[href*="/p/10001"]');
    link.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(resolve => env.window.setTimeout(resolve, 0));

    assert.equal(env.document.querySelectorAll('#tb__sheet_tabs .tb__sheet-post').length, 1);
    assert.match(env.document.querySelector('#tb__sheet_tabs .tb__sheet-post').textContent, /首页图帖/);
    assert.equal(env.document.querySelectorAll('#tb__excel_content .tb__excel-img').length, 2);

    const originalPostLink = env.document.querySelector('#tb__excel_origin');
    assert.ok(originalPostLink);
    assert.equal(originalPostLink.href, 'https://tieba.baidu.com/p/10001');
    assert.equal(originalPostLink.target, '_blank');
    assert.match(originalPostLink.rel, /noopener/);
    assert.notEqual(originalPostLink.style.display, 'none');

    env.document.querySelector('#tb__sheet_tabs [data-sheet="__home__"]').click();
    assert.equal(originalPostLink.style.display, 'none');
});

test('图片查看器按高清候选顺序失败回退到预览图', t => {
    const env = createEnvironment({
        html: fixture('post-with-images.html'),
        url: 'https://tieba.baidu.com/p/10001',
        values: { tb__rt_excelMode: 'true' }
    });
    t.after(env.close);

    const preview = Array.from(env.document.querySelectorAll('#tb__excel_content .tb__excel-img'))
        .find(image => image.src.includes('hash-direct.jpg'));
    preview.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    const viewerImage = env.document.querySelector('#tb__viewer_img');
    assert.equal(viewerImage.src, 'https://imgsa.baidu.com/forum/pic/item/hash-direct.jpg');
    viewerImage.dispatchEvent(new env.window.Event('error'));
    assert.equal(viewerImage.src, 'https://imgsrc.baidu.com/forum/pic/item/hash-direct.jpg');
    viewerImage.dispatchEvent(new env.window.Event('error'));
    assert.match(viewerImage.src, /tiebapic\.baidu\.com\/forum\/w%3D580\/sign=def\/hash-direct\.jpg/);
});

test('设置面板完整列出全部基础设置和高级设置', t => {
    const env = createEnvironment();
    t.after(env.close);
    env.menuCommands.get('贴吧摸鱼设置')();

    const normalKeys = [
        'adBlock', 'hideAvatar', 'hideImage', 'imgResize', 'hideHeader', 'hideSidebar',
        'foldQuote', 'keywordsBlock', 'markAndBan', 'darkMode', 'eyeCareMode', 'excelMode',
        'imgEnhance', 'authorMark', 'autoPage', 'linkTargetBlank'
    ];
    const advancedKeys = ['imgResizeWidth', 'foldQuoteHeight', 'fontResize'];
    normalKeys.forEach(key => assert.ok(env.document.querySelector(`#tb__cb_${key}`), key));
    advancedKeys.forEach(key => assert.ok(env.document.querySelector(`#tb__adv_${key}`), key));

    ['normal', 'advanced', 'backup', 'about'].forEach(section => {
        env.document.querySelector(`.tb__panel-tab[data-section="${section}"]`).click();
        assert.ok(env.document.querySelector(`#tb__section_${section}`).classList.contains('active'));
    });
});

test('高级设置加载和保存时限制在有效范围内', t => {
    const env = createEnvironment({
        html: fixture('settings-post.html'),
        url: 'https://tieba.baidu.com/p/30000',
        values: {
            tb__rt_excelMode: 'true',
            tb__advanced_setting: JSON.stringify({ imgResizeWidth: -1, foldQuoteHeight: 99999, fontResize: 99 })
        },
        beforeEval: window => {
            Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 3000 });
        }
    });
    t.after(env.close);

    const style = Array.from(env.document.querySelectorAll('style')).map(node => node.textContent).join('\n');
    assert.match(style, /max-width:80px/);
    assert.match(style, /font-size:32px/);
    assert.equal(env.document.querySelector('.core_reply_wrapper').style.maxHeight, '2000px');

    env.menuCommands.get('贴吧摸鱼设置')();
    env.document.querySelector('#tb__adv_imgResizeWidth').value = '99999';
    env.document.querySelector('#tb__adv_foldQuoteHeight').value = '-5';
    env.document.querySelector('#tb__adv_fontResize').value = '1';
    env.document.querySelector('#tb__save_btn').click();
    assert.deepEqual(JSON.parse(env.store.get('tb__advanced_setting')), {
        imgResizeWidth: 1600,
        foldQuoteHeight: 80,
        fontResize: 10
    });
});

test('内容过滤设置可屏蔽广告、关键字和黑名单用户', t => {
    const env = createEnvironment({
        html: fixture('settings-threads.html'),
        url: 'https://tieba.baidu.com/f?kw=设置测试吧',
        values: {
            tb__rt_excelMode: 'true',
            tb__keywords: '剧透',
            tb__banlist: JSON.stringify({ 黑名单用户: true })
        }
    });
    t.after(env.close);

    const threads = env.document.querySelectorAll('.j_thread_list');
    const advertisement = env.document.querySelector('#mediago-test');
    assert.equal(env.window.getComputedStyle(advertisement).display, 'none');
    assert.equal(threads[0].style.display, 'none');
    assert.equal(threads[1].style.display, 'none');
    assert.ok(env.menuCommands.has('关键字管理'));
    assert.ok(env.menuCommands.has('黑名单管理'));

    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    assert.notEqual(env.window.getComputedStyle(advertisement).display, 'none');
    assert.equal(threads[0].style.display, '');
    assert.equal(threads[1].style.display, '');
});

test('界面、主题和链接设置均能生效并可由快捷键切换', t => {
    const env = createEnvironment({
        html: fixture('settings-threads.html'),
        url: 'https://tieba.baidu.com/f?kw=设置测试吧',
        values: {
            tb__rt_excelMode: 'true',
            tb__setting: JSON.stringify({
                hideAvatar: true,
                hideImage: true,
                hideHeader: true,
                hideSidebar: true,
                darkMode: true,
                eyeCareMode: true,
                linkTargetBlank: true
            })
        }
    });
    t.after(env.close);

    ['tb__hide-avatar', 'tb__hide-image', 'tb__hide-header', 'tb__hide-sidebar', 'tb__eye-care']
        .forEach(className => assert.ok(env.document.body.classList.contains(className), className));
    assert.equal(env.document.body.classList.contains('tb__dark-mode'), false);
    assert.equal(env.document.querySelector('.j_th_tit').target, '_blank');

    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    assert.equal(env.document.body.classList.contains('tb__hide-avatar'), false);
    assert.equal(env.document.body.classList.contains('tb__hide-image'), false);
    assert.equal(env.document.body.classList.contains('tb__eye-care'), false);
    assert.equal(env.document.body.classList.contains('tb__dark-mode'), true);

    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    assert.equal(env.document.querySelector('.j_th_tit').hasAttribute('target'), false);
    assert.equal(env.document.body.classList.contains('tb__dark-mode'), false);
});

test('帖子增强设置可折叠楼中楼、标记楼主、修复懒加载和打开查看器', t => {
    const env = createEnvironment({
        html: fixture('settings-post.html'),
        url: 'https://tieba.baidu.com/p/30000',
        values: { tb__rt_excelMode: 'true' },
        beforeEval: window => {
            Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 600 });
        }
    });
    t.after(env.close);

    const wrapper = env.document.querySelector('.core_reply_wrapper');
    assert.ok(wrapper.classList.contains('tb__quote-folded'));
    env.document.querySelector('.tb__quote-expand').click();
    assert.equal(wrapper.style.maxHeight, 'none');
    assert.equal(env.document.querySelectorAll('.tb__author-badge').length, 1);
    assert.ok(env.document.querySelector('#tb__img_viewer'));
    assert.match(env.document.querySelector('.BDE_Image').src, /settings-image\.jpg/);

    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    assert.equal(wrapper.classList.contains('tb__quote-folded'), false);
    assert.equal(wrapper.style.maxHeight, '');
    assert.equal(wrapper.hasAttribute('data-tb-folded'), false);
    assert.equal(env.document.querySelector('.tb__quote-expand'), null);
    assert.equal(env.document.querySelector('.tb__author-badge'), null);
    assert.match(env.document.querySelector('.BDE_Image').src, /^data:image/);
});

test('隐藏头像设置覆盖主楼头像和楼中楼头像', t => {
    const env = createEnvironment({
        html: fixture('settings-post.html'),
        url: 'https://tieba.baidu.com/p/30000',
        values: {
            tb__rt_excelMode: 'true',
            tb__setting: JSON.stringify({ hideAvatar: true })
        }
    });
    t.after(env.close);

    assert.equal(env.window.getComputedStyle(env.document.querySelector('#tb__main_avatar').closest('.p_author_face')).display, 'none');
    assert.equal(env.window.getComputedStyle(env.document.querySelector('#tb__lzl_avatar').closest('.lzl_p_p')).display, 'none');
});

test('自动翻页设置会在触底后追加下一页帖子', async t => {
    let observerCallback;
    const env = createEnvironment({
        html: fixture('settings-threads.html'),
        url: 'https://tieba.baidu.com/f?kw=设置测试吧',
        values: { tb__setting: JSON.stringify({ autoPage: true }) },
        fetchHtml: fixture('threads-next.html'),
        beforeEval: window => {
            window.IntersectionObserver = class {
                constructor(callback) { observerCallback = callback; }
                observe() {}
                disconnect() {}
            };
        }
    });
    t.after(env.close);

    assert.equal(env.document.querySelector('#tb__autopage_sentinel'), null);
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    assert.ok(env.document.querySelector('#tb__autopage_sentinel'));
    observerCallback([{ isIntersecting: true }]);
    await new Promise(resolve => env.window.setTimeout(resolve, 0));
    assert.match(env.document.querySelector('#thread_list').textContent, /下一页帖子/);

    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    assert.doesNotMatch(env.document.querySelector('#thread_list').textContent, /下一页帖子/);
    assert.equal(env.document.querySelector('#tb__autopage_sentinel'), null);
});

test('关键字和黑名单管理器按纯文本展示用户输入', t => {
    const payload = '</textarea><img id="tb__manager_attack" src="x">';
    const env = createEnvironment({
        values: {
            tb__keywords: payload,
            tb__banlist: JSON.stringify({ [payload]: true })
        }
    });
    t.after(env.close);

    env.menuCommands.get('关键字管理')();
    assert.equal(env.document.querySelector('#tb__manager_attack'), null);
    assert.equal(env.document.querySelector('#tb__kw_textarea').value, payload);
    env.document.querySelector('#tb__kw_cancel').click();

    env.menuCommands.get('黑名单管理')();
    assert.equal(env.document.querySelector('#tb__manager_attack'), null);
    assert.match(env.document.querySelector('#tb__ban_list').textContent, /tb__manager_attack/);
});

test('重置配置同时清理基础、高级、名单和快捷键状态', t => {
    const keys = [
        'tb__setting', 'tb__advanced_setting', 'tb__keywords', 'tb__banlist',
        'tb__rt_hideAvatar', 'tb__rt_hideImage', 'tb__rt_darkMode',
        'tb__rt_eyeCareMode', 'tb__rt_excelMode'
    ];
    const values = Object.fromEntries(keys.map(key => [key, 'saved']));
    values.tb__setting = '{}';
    values.tb__advanced_setting = '{}';
    values.tb__banlist = '{}';
    const env = createEnvironment({ values });
    t.after(env.close);

    env.menuCommands.get('贴吧摸鱼设置')();
    env.document.querySelector('#tb__reset_btn').click();
    keys.forEach(key => assert.equal(env.store.has(key), false, key));
});
