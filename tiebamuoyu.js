// ==UserScript==
// @name         百度贴吧优化摸鱼体验
// @namespace    tieba-moyu-script
// @version      1.0.0
// @author       Moyu
// @description  百度贴吧显示优化，功能增强，优雅的摸鱼
// @license      MIT
// @match        *://tieba.baidu.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =============================================
    //  核心类 TieBaScript
    // =============================================
    class TieBaScript {
        constructor() {
            this.setting = { original: [], normal: {}, advanced: {} };
            this.modules = [];
            this.style = '';
            this.version = '1.0.0';
        }

        getModule(name) {
            return this.modules.find(m => m.name === name) || null;
        }

        isThreads() {
            return /\/f\?/.test(location.href) || location.pathname === '/f';
        }

        isForms() {
            return /\/p\/\d+/.test(location.href);
        }

        isHome() {
            return location.pathname === '/' || location.pathname === '';
        }

        $(selector, root) {
            return (root || document).querySelector(selector);
        }

        $$(selector, root) {
            return Array.from((root || document).querySelectorAll(selector));
        }

        addModule(module) {
            if (module.preProcFunc) {
                try { module.preProcFunc(this); } catch (e) {
                    this.printLog(`[${module.name}] preProcFunc 失败`); console.error(e);
                }
            }
            const addSetting = s => {
                if (s.key) {
                    this.setting[s.type || 'normal'][s.key] = s.default ?? '';
                    this.setting.original.push(s);
                }
            };
            if (module.setting && !Array.isArray(module.setting)) addSetting(module.setting);
            if (module.settings && Array.isArray(module.settings)) module.settings.forEach(addSetting);
            if (module.style) this.style += module.style;
            this.modules.push(module);
        }

        init() {
            this.printLog('初始化...');
            const t0 = performance.now();
            this.loadSetting();

            for (const m of this.modules) {
                if (m.initFunc) {
                    try { m.initFunc(this); } catch (e) {
                        this.printLog(`[${m.name}] initFunc 失败`); console.error(e);
                    }
                }
            }
            for (const m of this.modules) {
                if (m.postProcFunc) {
                    try { m.postProcFunc(this); } catch (e) {
                        this.printLog(`[${m.name}] postProcFunc 失败`); console.error(e);
                    }
                }
            }
            for (const m of this.modules) {
                if (m.asyncStyle) {
                    try { this.style += m.asyncStyle(this); } catch (e) {
                        this.printLog(`[${m.name}] asyncStyle 失败`); console.error(e);
                    }
                }
            }

            if (this.style) {
                const el = document.createElement('style');
                el.textContent = this.style;
                document.head.appendChild(el);
            }

            this.printLog(`[v${this.version}] 初始化完成: ${this.modules.length}个模块, 耗时${Math.round(performance.now() - t0)}ms`);
        }

        renderAlways() {
            for (const m of this.modules) {
                if (m.renderAlwaysFunc) {
                    try { m.renderAlwaysFunc(this); } catch (e) { console.error(`[${m.name}] renderAlways:`, e); }
                }
            }
        }

        renderThreads() {
            this.$$('.j_thread_list:not([tb-render])').forEach(el => {
                for (const m of this.modules) {
                    if (m.renderThreadsFunc) {
                        try { m.renderThreadsFunc(el, this); } catch (e) { console.error(`[${m.name}] renderThreads:`, e); }
                    }
                }
                el.setAttribute('tb-render', '1');
            });
        }

        renderForms() {
            this.$$('.l_post.j_l_post:not([tb-render])').forEach(el => {
                for (const m of this.modules) {
                    if (m.renderFormsFunc) {
                        try { m.renderFormsFunc(el, this); } catch (e) { console.error(`[${m.name}] renderForms:`, e); }
                    }
                }
                el.setAttribute('tb-render', '1');
            });
        }

        getValue(key) {
            try { return GM_getValue(key); } catch { return localStorage.getItem(key); }
        }
        setValue(key, value) {
            try { GM_setValue(key, value); } catch { localStorage.setItem(key, value); }
        }
        deleteValue(key) {
            try { GM_deleteValue(key); } catch {}
            localStorage.removeItem(key);
        }

        saveSetting(msg = '保存成功，刷新页面生效') {
            for (const k in this.setting.normal) {
                const cb = document.getElementById('tb__cb_' + k);
                if (cb) this.setting.normal[k] = cb.checked;
            }
            this.setValue('tb__setting', JSON.stringify(this.setting.normal));
            for (const k in this.setting.advanced) {
                const el = document.getElementById('tb__adv_' + k);
                if (!el) continue;
                const orig = this.setting.original.find(s => s.type === 'advanced' && s.key === k);
                const vt = typeof orig?.default;
                if (el.nodeName === 'SELECT') this.setting.advanced[k] = el.value;
                else if (vt === 'boolean') this.setting.advanced[k] = el.checked;
                else if (vt === 'number') this.setting.advanced[k] = +el.value;
                else this.setting.advanced[k] = el.value;
            }
            this.setValue('tb__advanced_setting', JSON.stringify(this.setting.advanced));
            if (msg) this.popMsg(msg);
        }

        loadSetting() {
            try {
                const s = this.getValue('tb__setting');
                if (s) {
                    const local = JSON.parse(s);
                    for (const k in this.setting.normal) {
                        if (!(k in local)) local[k] = this.setting.normal[k];
                    }
                    for (const k in local) {
                        if (!(k in this.setting.normal)) delete local[k];
                    }
                    this.setting.normal = local;
                }
                const a = this.getValue('tb__advanced_setting');
                if (a) {
                    const localAdv = JSON.parse(a);
                    for (const k in this.setting.advanced) {
                        if (!(k in localAdv)) localAdv[k] = this.setting.advanced[k];
                    }
                    for (const k in localAdv) {
                        if (!(k in this.setting.advanced)) delete localAdv[k];
                    }
                    this.setting.advanced = localAdv;
                }
            } catch (e) {
                this.printLog('配置加载失败: ' + e.message);
            }
        }

        popMsg(msg, type = 'ok') {
            const old = document.querySelector('.tb__msg');
            if (old) old.remove();
            const colors = { ok: '#52c41a', err: '#ff4d4f', warn: '#faad14' };
            const div = document.createElement('div');
            div.className = 'tb__msg';
            Object.assign(div.style, {
                position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                padding: '10px 24px', borderRadius: '8px', zIndex: '999999',
                background: colors[type] || colors.ok, color: '#fff',
                fontSize: '14px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,.15)',
                transition: 'opacity .3s', opacity: '0'
            });
            div.textContent = msg;
            document.body.appendChild(div);
            requestAnimationFrame(() => div.style.opacity = '1');
            setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 400); }, type === 'ok' ? 2000 : 4000);
        }

        popNotification(msg, duration = 1500) {
            let container = document.getElementById('tb__noti');
            if (!container) {
                container = document.createElement('div');
                container.id = 'tb__noti';
                Object.assign(container.style, {
                    position: 'fixed', bottom: '20px', right: '20px', zIndex: '999998', display: 'flex', flexDirection: 'column', gap: '8px'
                });
                document.body.appendChild(container);
            }
            const div = document.createElement('div');
            Object.assign(div.style, {
                padding: '8px 16px', background: 'rgba(0,0,0,.75)', color: '#fff',
                borderRadius: '6px', fontSize: '13px', transition: 'opacity .3s', opacity: '0'
            });
            div.textContent = msg;
            container.appendChild(div);
            requestAnimationFrame(() => div.style.opacity = '1');
            setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 400); }, duration);
        }

        printLog(msg) {
            console.log(
                `%c贴吧%cMoyu%c ${msg}`,
                'background:#2932e1;color:#fff;font-weight:bold;padding:2px 2px 2px 4px;border-radius:4px 0 0 4px;',
                'background:#f60;color:#fff;font-weight:bold;padding:2px 4px 2px 2px;border-radius:0 4px 4px 0;',
                'background:none;color:inherit;'
            );
        }
    }

    const script = new TieBaScript();

    // =============================================
    //  模块1: SettingPanel 设置面板
    // =============================================
    script.addModule({
        name: 'SettingPanel',
        title: '设置面板',
        style: `
            #tb__setting_cover{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:100000;display:none;justify-content:center;align-items:center}
            #tb__setting_panel{background:#fff;border-radius:12px;width:680px;max-height:80vh;overflow-y:auto;padding:0;box-shadow:0 8px 32px rgba(0,0,0,.2);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
            .tb__panel-header{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff;border-radius:12px 12px 0 0;z-index:1}
            .tb__panel-header h3{margin:0;font-size:18px;color:#333}
            .tb__panel-close{cursor:pointer;font-size:24px;color:#999;line-height:1;border:none;background:none;padding:0}
            .tb__panel-close:hover{color:#333}
            .tb__panel-tabs{display:flex;gap:0;border-bottom:1px solid #eee}
            .tb__panel-tab{padding:10px 24px;cursor:pointer;border:none;background:none;font-size:14px;color:#666;border-bottom:2px solid transparent;transition:all .2s}
            .tb__panel-tab.active{color:#2932e1;border-bottom-color:#2932e1;font-weight:600}
            .tb__panel-body{padding:20px 24px}
            .tb__panel-section{display:none}
            .tb__panel-section.active{display:block}
            .tb__setting-group{margin-bottom:16px}
            .tb__setting-group h4{font-size:13px;color:#999;margin:0 0 8px;text-transform:uppercase;letter-spacing:.5px}
            .tb__setting-item{display:flex;align-items:center;padding:8px 0;border-bottom:1px solid #f5f5f5}
            .tb__setting-item:last-child{border-bottom:none}
            .tb__setting-item label{flex:1;font-size:14px;color:#333;cursor:pointer;user-select:none}
            .tb__setting-item label small{display:block;font-size:12px;color:#999;margin-top:2px}
            .tb__switch{position:relative;width:40px;height:22px;flex-shrink:0}
            .tb__switch input{opacity:0;width:0;height:0}
            .tb__switch .tb__slider{position:absolute;inset:0;background:#ccc;border-radius:22px;cursor:pointer;transition:.3s}
            .tb__switch .tb__slider:before{content:"";position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}
            .tb__switch input:checked+.tb__slider{background:#2932e1}
            .tb__switch input:checked+.tb__slider:before{transform:translateX(18px)}
            .tb__adv-item{display:flex;align-items:center;padding:8px 0;gap:12px;border-bottom:1px solid #f5f5f5}
            .tb__adv-item label{font-size:14px;color:#333;min-width:120px}
            .tb__adv-item input[type=number],.tb__adv-item input[type=text],.tb__adv-item select{padding:4px 8px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;outline:none}
            .tb__adv-item input:focus,.tb__adv-item select:focus{border-color:#2932e1}
            .tb__panel-footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid #eee;position:sticky;bottom:0;background:#fff;border-radius:0 0 12px 12px}
            .tb__btn{padding:6px 20px;border-radius:6px;border:1px solid #d9d9d9;background:#fff;cursor:pointer;font-size:14px;transition:all .2s}
            .tb__btn:hover{border-color:#2932e1;color:#2932e1}
            .tb__btn-primary{background:#2932e1;color:#fff;border-color:#2932e1}
            .tb__btn-primary:hover{background:#1a23b5}
            .tb__btn-danger{color:#ff4d4f;border-color:#ff4d4f}
            .tb__btn-danger:hover{background:#ff4d4f;color:#fff}
        `,
        initFunc(ctx) {
            GM_registerMenuCommand('贴吧摸鱼设置', () => openPanel());

            const triggerBtn = document.createElement('a');
            triggerBtn.textContent = '⚙ 摸鱼设置';
            Object.assign(triggerBtn.style, {
                cursor: 'pointer', marginLeft: '12px', fontSize: '13px', color: '#2932e1', fontWeight: 'bold'
            });
            triggerBtn.addEventListener('click', openPanel);

            const tryInsert = () => {
                const navbar = document.querySelector('.u_menu_item, .u_ddl, #com_userbar, .tbui_aside_fbar_button, .more_pager, #head .search_nav');
                if (navbar) navbar.parentElement.appendChild(triggerBtn);
                else {
                    const fixed = document.createElement('div');
                    fixed.id = 'tb__fixed_setting_btn';
                    Object.assign(fixed.style, {
                        position: 'fixed', top: '8px', right: '80px', zIndex: '99999', background: '#2932e1',
                        color: '#fff', padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(41,50,225,.3)'
                    });
                    fixed.textContent = '⚙ 摸鱼设置';
                    fixed.addEventListener('click', openPanel);
                    document.body.appendChild(fixed);
                }
            };
            setTimeout(tryInsert, 500);

            function openPanel() {
                let cover = document.getElementById('tb__setting_cover');
                if (cover) { cover.style.display = 'flex'; return; }

                cover = document.createElement('div');
                cover.id = 'tb__setting_cover';
                cover.innerHTML = buildPanelHTML(ctx);
                document.body.appendChild(cover);
                cover.style.display = 'flex';

                cover.querySelector('.tb__panel-close').addEventListener('click', () => cover.style.display = 'none');
                cover.addEventListener('click', e => { if (e.target === cover) cover.style.display = 'none'; });

                cover.querySelectorAll('.tb__panel-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        cover.querySelectorAll('.tb__panel-tab').forEach(t => t.classList.remove('active'));
                        cover.querySelectorAll('.tb__panel-section').forEach(s => s.classList.remove('active'));
                        tab.classList.add('active');
                        cover.querySelector(`#tb__section_${tab.dataset.section}`).classList.add('active');
                    });
                });

                cover.querySelector('#tb__save_btn').addEventListener('click', () => ctx.saveSetting());
                cover.querySelector('#tb__reset_btn').addEventListener('click', () => {
                    if (!confirm('确定要重置所有配置吗？')) return;
                    ctx.deleteValue('tb__setting');
                    ctx.deleteValue('tb__advanced_setting');
                    ctx.popMsg('已重置，刷新页面生效');
                });
            }

            function buildPanelHTML(ctx) {
                const normals = ctx.setting.original.filter(s => (s.type || 'normal') === 'normal');
                const advanceds = ctx.setting.original.filter(s => s.type === 'advanced');

                const groups = {};
                normals.forEach(s => {
                    const g = s.group || '通用';
                    if (!groups[g]) groups[g] = [];
                    groups[g].push(s);
                });

                let normalHTML = '';
                for (const [gname, items] of Object.entries(groups)) {
                    normalHTML += `<div class="tb__setting-group"><h4>${gname}</h4>`;
                    items.forEach(s => {
                        const checked = ctx.setting.normal[s.key] ? 'checked' : '';
                        normalHTML += `
                            <div class="tb__setting-item">
                                <label for="tb__cb_${s.key}">${s.title || s.key}${s.desc ? `<small>${s.desc}</small>` : ''}</label>
                                <div class="tb__switch"><input type="checkbox" id="tb__cb_${s.key}" ${checked}><span class="tb__slider"></span></div>
                            </div>`;
                    });
                    normalHTML += '</div>';
                }

                let advHTML = '';
                advanceds.forEach(s => {
                    const val = ctx.setting.advanced[s.key];
                    let input = '';
                    if (typeof s.default === 'boolean') {
                        input = `<input type="checkbox" id="tb__adv_${s.key}" ${val ? 'checked' : ''}>`;
                    } else if (typeof s.default === 'number') {
                        input = `<input type="number" id="tb__adv_${s.key}" value="${val}" style="width:80px">`;
                    } else if (s.options) {
                        input = `<select id="tb__adv_${s.key}">${s.options.map(o => `<option value="${o.value}" ${val === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`;
                    } else {
                        input = `<input type="text" id="tb__adv_${s.key}" value="${val}" style="width:160px">`;
                    }
                    advHTML += `<div class="tb__adv-item"><label>${s.title || s.key}${s.desc ? ` <small style="color:#999">(${s.desc})</small>` : ''}</label>${input}</div>`;
                });

                return `<div id="tb__setting_panel">
                    <div class="tb__panel-header"><h3>🐟 贴吧摸鱼设置 v${ctx.version}</h3><button class="tb__panel-close">&times;</button></div>
                    <div class="tb__panel-tabs">
                        <button class="tb__panel-tab active" data-section="normal">基础设置</button>
                        <button class="tb__panel-tab" data-section="advanced">高级设置</button>
                        <button class="tb__panel-tab" data-section="backup">备份管理</button>
                        <button class="tb__panel-tab" data-section="about">关于</button>
                    </div>
                    <div class="tb__panel-body">
                        <div id="tb__section_normal" class="tb__panel-section active">${normalHTML || '<p style="color:#999">暂无设置项</p>'}</div>
                        <div id="tb__section_advanced" class="tb__panel-section">${advHTML || '<p style="color:#999">暂无高级设置</p>'}</div>
                        <div id="tb__section_backup" class="tb__panel-section">
                            <p style="margin-bottom:12px;font-size:14px;color:#666">导出或导入你的配置:</p>
                            <textarea id="tb__backup_text" style="width:100%;height:120px;border:1px solid #d9d9d9;border-radius:6px;padding:8px;font-size:12px;font-family:monospace;resize:vertical" placeholder="点击导出获取配置，或粘贴配置后点击导入"></textarea>
                            <div style="display:flex;gap:8px;margin-top:12px">
                                <button class="tb__btn" id="tb__export_btn">导出配置</button>
                                <button class="tb__btn" id="tb__import_btn">导入配置</button>
                            </div>
                        </div>
                        <div id="tb__section_about" class="tb__panel-section">
                            <div style="text-align:center;padding:20px 0">
                                <h2 style="color:#2932e1;margin-bottom:8px">🐟 百度贴吧优化摸鱼体验</h2>
                                <p style="color:#999;font-size:14px">v${ctx.version}</p>
                                <p style="color:#666;font-size:14px;margin-top:16px">参考 NGA优化摸鱼体验 脚本设计</p>
                                <div style="margin-top:24px;font-size:13px;color:#999">
                                    <p>快捷键: Q隐藏头像 | E隐藏图片 | R Excel模式 | D暗黑模式 | T回顶部 | B回底部</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="tb__panel-footer">
                        <button class="tb__btn tb__btn-danger" id="tb__reset_btn">重置配置</button>
                        <button class="tb__btn tb__btn-primary" id="tb__save_btn">保存配置</button>
                    </div>
                </div>`;
            }
        },
        postProcFunc(ctx) {
            const cover = document.getElementById('tb__setting_cover');
            if (!cover) return;
            const exportBtn = cover.querySelector('#tb__export_btn');
            const importBtn = cover.querySelector('#tb__import_btn');
            const textarea = cover.querySelector('#tb__backup_text');
            if (exportBtn) exportBtn.addEventListener('click', () => {
                textarea.value = JSON.stringify({ normal: ctx.setting.normal, advanced: ctx.setting.advanced }, null, 2);
                ctx.popMsg('配置已导出');
            });
            if (importBtn) importBtn.addEventListener('click', () => {
                try {
                    const data = JSON.parse(textarea.value);
                    if (data.normal) ctx.setValue('tb__setting', JSON.stringify(data.normal));
                    if (data.advanced) ctx.setValue('tb__advanced_setting', JSON.stringify(data.advanced));
                    ctx.popMsg('导入成功，刷新页面生效');
                } catch { ctx.popMsg('导入失败: JSON格式错误', 'err'); }
            });
        }
    });

    // =============================================
    //  模块2: ShortCutKeys 快捷键
    // =============================================
    script.addModule({
        name: 'ShortCutKeys',
        title: '快捷键支持',
        _handlers: {},
        register(key, desc, fn) {
            this._handlers[key.toUpperCase()] = { desc, fn };
        },
        initFunc(ctx) {
            const self = ctx.getModule('ShortCutKeys');
            document.addEventListener('keydown', e => {
                if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
                if (e.ctrlKey || e.altKey || e.metaKey) return;
                const handler = self._handlers[e.key.toUpperCase()];
                if (handler) { e.preventDefault(); handler.fn(); }
                if (e.key === 'Escape') {
                    const cover = document.getElementById('tb__setting_cover');
                    if (cover) cover.style.display = 'none';
                    const imgViewer = document.getElementById('tb__img_viewer');
                    if (imgViewer) imgViewer.classList.remove('active');
                }
            });
        }
    });

    // =============================================
    //  模块3: AdBlock 广告屏蔽
    // =============================================
    script.addModule({
        name: 'AdBlock',
        title: '广告屏蔽',
        setting: { key: 'adBlock', title: '广告屏蔽', desc: '移除贴吧内置广告和推广内容', default: true, group: '内容过滤' },
        style: `
            body.tb__adblock [id^="mediago"],
            body.tb__adblock .tb_rich_poster_container,
            body.tb__adblock .thread_theme_bright,
            body.tb__adblock .tbui_aside_fbar_button.tbui_fbar_tsukkomi,
            body.tb__adblock [data-type="tb-datalazyload"],
            body.tb__adblock .app_download_box,
            body.tb__adblock .tb_poster_placeholder,
            body.tb__adblock .aside_region,
            body.tb__adblock #spage_liveroom_bar,
            body.tb__adblock .firework-wrap,
            body.tb__adblock .tbui_aside_fbar_button.tbui_fbar_share,
            body.tb__adblock .topic_list_box,
            body.tb__adblock .aggregation_card,
            body.tb__adblock .tb_appdl_interstitial,
            body.tb__adblock .carousel-wrap,
            body.tb__adblock .hot_topic_wrap,
            body.tb__adblock .j_tabthem_tag {display:none!important}
        `,
        initFunc(ctx) {
            if (!ctx.setting.normal.adBlock) return;
            document.body.classList.add('tb__adblock');
        },
        renderAlwaysFunc(ctx) {
            if (!ctx.setting.normal.adBlock) return;
            ctx.$$('[id^="mediago"], .tb_rich_poster_container, .tb_poster_placeholder').forEach(el => el.remove());
            ctx.$$('.j_thread_list').forEach(el => {
                const dataField = el.getAttribute('data-field');
                if (dataField) {
                    try {
                        const d = JSON.parse(dataField);
                        if (d.is_ad || d.is_promo) el.style.display = 'none';
                    } catch {}
                }
            });
        }
    });

    // =============================================
    //  模块4: HideAvatar 隐藏头像
    // =============================================
    script.addModule({
        name: 'HideAvatar',
        title: '隐藏头像',
        setting: { key: 'hideAvatar', title: '隐藏头像', desc: '隐藏用户头像 [快捷键 Q]', default: false, group: '界面优化' },
        style: `
            body.tb__hide-avatar .d_author .p_author_face,
            body.tb__hide-avatar .icon_author,
            body.tb__hide-avatar .lzl_single_post .lzl_cnt .lzl_content_main .j_user_card img,
            body.tb__hide-avatar .threadlist_author .tb_icon_author,
            body.tb__hide-avatar .tb_icon_author_rely {display:none!important}
        `,
        initFunc(ctx) {
            if (ctx.getValue('tb__rt_hideAvatar') === 'true' || ctx.setting.normal.hideAvatar) document.body.classList.add('tb__hide-avatar');
            ctx.getModule('ShortCutKeys').register('Q', '隐藏头像', () => {
                document.body.classList.toggle('tb__hide-avatar');
                const on = document.body.classList.contains('tb__hide-avatar');
                ctx.setValue('tb__rt_hideAvatar', on ? 'true' : 'false');
                ctx.popNotification(on ? '头像已隐藏' : '头像已显示');
            });
        }
    });

    // =============================================
    //  模块5: HideImage 隐藏图片
    // =============================================
    script.addModule({
        name: 'HideImage',
        title: '隐藏图片',
        setting: { key: 'hideImage', title: '隐藏图片', desc: '隐藏帖子内图片 [快捷键 E]', default: false, group: '界面优化' },
        style: `
            body.tb__hide-image .BDE_Image,
            body.tb__hide-image .d_post_content img[pic_type],
            body.tb__hide-image .vpic_wrap,
            body.tb__hide-image .d_post_content .video_wrap,
            body.tb__hide-image .threadlist_rep_num ~ .threadlist_media,
            body.tb__hide-image .tb__excel-table .tb__excel-img {display:none!important}
            body.tb__hide-image .tb__img-tag{display:inline!important}
            body:not(.tb__hide-image) .tb__img-tag{display:none!important}
            .tb__img-tag{display:none;padding:1px 4px;background:#f0f0f0;border:1px solid #d9d9d9;border-radius:3px;font-size:11px;color:#8c8c8c;cursor:default;white-space:nowrap;vertical-align:middle;margin:0 2px}
            .tb__excel-img{max-height:60px;max-width:120px;vertical-align:middle;border-radius:3px;margin:2px;cursor:pointer}
            body.tb__dark-mode .tb__img-tag{background:#21262d!important;border-color:#30363d!important;color:#8b949e!important}
        `,
        initFunc(ctx) {
            if (ctx.getValue('tb__rt_hideImage') === 'true' || ctx.setting.normal.hideImage) document.body.classList.add('tb__hide-image');
            ctx.getModule('ShortCutKeys').register('E', '隐藏图片', () => {
                document.body.classList.toggle('tb__hide-image');
                const on = document.body.classList.contains('tb__hide-image');
                ctx.setValue('tb__rt_hideImage', on ? 'true' : 'false');
                ctx.popNotification(on ? '图片已隐藏' : '图片已显示');
            });
        }
    });

    // =============================================
    //  模块6: ImgResize 图片缩放
    // =============================================
    script.addModule({
        name: 'ImgResize',
        title: '图片缩放',
        settings: [
            { key: 'imgResize', title: '帖内图片缩放', desc: '限制帖内图片最大宽度', default: true, group: '界面优化' },
            { key: 'imgResizeWidth', title: '图片最大宽度(px)', default: 250, type: 'advanced', desc: '帖内图片最大显示宽度' }
        ],
        asyncStyle(ctx) {
            if (!ctx.setting.normal.imgResize) return '';
            const w = ctx.setting.advanced.imgResizeWidth || 250;
            return `.d_post_content .BDE_Image{max-width:${w}px!important;height:auto!important;cursor:zoom-in;transition:max-width .3s}
                    .d_post_content .BDE_Image:hover{max-width:${w * 2}px!important}`;
        }
    });

    // =============================================
    //  模块7: HideHeader 隐藏版头
    // =============================================
    script.addModule({
        name: 'HideHeader',
        title: '隐藏版头',
        setting: { key: 'hideHeader', title: '隐藏版头', desc: '隐藏贴吧顶部横幅和推荐区', default: true, group: '界面优化' },
        style: `
            body.tb__hide-header .head_banner,
            body.tb__hide-header .forum_head,
            body.tb__hide-header #forum_head,
            body.tb__hide-header .card_banner,
            body.tb__hide-header .plat_recom_carousel,
            body.tb__hide-header .plat_header_container,
            body.tb__hide-header #branding_ads,
            body.tb__hide-header .suggestion_list_wrap,
            body.tb__hide-header .banglog-wraper,
            body.tb__hide-header .search_nav_wrap,
            body.tb__hide-header .tbui_aside_fbar_button.tbui_fbar_home,
            body.tb__hide-header .card_head,
            body.tb__hide-header .forum_rcmd {display:none!important}
        `,
        initFunc(ctx) {
            if (ctx.setting.normal.hideHeader) document.body.classList.add('tb__hide-header');
        }
    });

    // =============================================
    //  模块8: HideSidebar 隐藏侧栏
    // =============================================
    script.addModule({
        name: 'HideSidebar',
        title: '隐藏侧栏',
        setting: { key: 'hideSidebar', title: '隐藏右侧栏', desc: '隐藏右侧广告和推荐栏', default: true, group: '界面优化' },
        style: `
            body.tb__hide-sidebar .right_section{display:none!important}
            body.tb__hide-sidebar .content .left_section{width:100%!important}
            body.tb__hide-sidebar #container .content{width:auto!important}
        `,
        initFunc(ctx) {
            if (ctx.setting.normal.hideSidebar) document.body.classList.add('tb__hide-sidebar');
        }
    });

    // =============================================
    //  模块9: FoldQuote 折叠引用/楼中楼
    // =============================================
    script.addModule({
        name: 'FoldQuote',
        title: '折叠楼中楼',
        settings: [
            { key: 'foldQuote', title: '折叠长楼中楼', desc: '超过设定高度的楼中楼自动折叠', default: true, group: '界面优化' },
            { key: 'foldQuoteHeight', title: '折叠高度阈值(px)', default: 200, type: 'advanced', desc: '楼中楼超过该高度时折叠' }
        ],
        style: `
            .tb__quote-folded{max-height:200px;overflow:hidden;position:relative}
            .tb__quote-folded::after{content:"";position:absolute;bottom:0;left:0;right:0;height:40px;background:linear-gradient(transparent,#f5f5f5);pointer-events:none}
            .tb__quote-expand{display:block;text-align:center;padding:6px;cursor:pointer;color:#2932e1;font-size:13px;background:#f0f0f0;border-radius:4px;margin-top:4px;user-select:none}
            .tb__quote-expand:hover{background:#e6e6e6}
        `,
        renderFormsFunc(el, ctx) {
            if (!ctx.setting.normal.foldQuote) return;
            const h = ctx.setting.advanced.foldQuoteHeight || 200;
            el.querySelectorAll('.core_reply_wrapper').forEach(wrapper => {
                if (wrapper.dataset.tbFolded) return;
                if (wrapper.scrollHeight > h) {
                    wrapper.classList.add('tb__quote-folded');
                    wrapper.style.maxHeight = h + 'px';
                    const btn = document.createElement('div');
                    btn.className = 'tb__quote-expand';
                    btn.textContent = '展开楼中楼';
                    btn.addEventListener('click', () => {
                        if (wrapper.classList.contains('tb__quote-folded')) {
                            wrapper.classList.remove('tb__quote-folded');
                            wrapper.style.maxHeight = 'none';
                            btn.textContent = '收起楼中楼';
                        } else {
                            wrapper.classList.add('tb__quote-folded');
                            wrapper.style.maxHeight = h + 'px';
                            btn.textContent = '展开楼中楼';
                        }
                    });
                    wrapper.parentElement.insertBefore(btn, wrapper.nextSibling);
                }
                wrapper.dataset.tbFolded = '1';
            });
        }
    });

    // =============================================
    //  模块10: FontResize 字体调整
    // =============================================
    script.addModule({
        name: 'FontResize',
        title: '字体大小调整',
        setting: { key: 'fontResize', title: '全局字体大小(px)', default: 14, type: 'advanced', desc: '设置页面全局字体大小' },
        asyncStyle(ctx) {
            const size = ctx.setting.advanced.fontResize || 14;
            if (size === 14) return '';
            return `.d_post_content, .j_d_post_content, .lzl_content_main, .j_thread_list .threadlist_title a, .j_thread_list .threadlist_abs {font-size:${size}px!important}`;
        }
    });

    // =============================================
    //  模块11: ExtraDocker 扩展坞
    // =============================================
    script.addModule({
        name: 'ExtraDocker',
        title: '扩展坞',
        style: `
            .tb__docker{position:fixed;right:16px;bottom:80px;z-index:99990;display:flex;flex-direction:column;gap:8px}
            .tb__docker-btn{width:40px;height:40px;border-radius:50%;background:#fff;border:1px solid #e0e0e0;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;transition:all .2s;box-shadow:0 2px 8px rgba(0,0,0,.08)}
            .tb__docker-btn:hover{background:#2932e1;color:#fff;border-color:#2932e1;transform:scale(1.1)}
            .tb__docker-btn[title]:hover::before{content:attr(title);position:absolute;right:50px;background:rgba(0,0,0,.75);color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;white-space:nowrap}
        `,
        initFunc(ctx) {
            const docker = document.createElement('div');
            docker.className = 'tb__docker';
            docker.innerHTML = `
                <div class="tb__docker-btn" id="tb__jump_top" title="回到顶部">↑</div>
                <div class="tb__docker-btn" id="tb__jump_refresh" title="刷新页面">↻</div>
                <div class="tb__docker-btn" id="tb__jump_setting" title="摸鱼设置">⚙</div>
                <div class="tb__docker-btn" id="tb__jump_bottom" title="回到底部">↓</div>
            `;
            document.body.appendChild(docker);

            docker.querySelector('#tb__jump_top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
            docker.querySelector('#tb__jump_bottom').addEventListener('click', () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
            docker.querySelector('#tb__jump_refresh').addEventListener('click', () => location.reload());
            docker.querySelector('#tb__jump_setting').addEventListener('click', () => {
                const cover = document.getElementById('tb__setting_cover');
                if (cover) cover.style.display = 'flex';
            });

            ctx.getModule('ShortCutKeys').register('T', '回到顶部', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
            ctx.getModule('ShortCutKeys').register('B', '回到底部', () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
        }
    });

    // =============================================
    //  模块12: KeywordsBlock 关键字屏蔽
    // =============================================
    script.addModule({
        name: 'KeywordsBlock',
        title: '关键字屏蔽',
        setting: { key: 'keywordsBlock', title: '关键字屏蔽', desc: '按关键字过滤帖子 (支持正则: 以/开头)', default: true, group: '内容过滤' },
        _keywords: [],
        initFunc(ctx) {
            if (!ctx.setting.normal.keywordsBlock) return;
            const raw = ctx.getValue('tb__keywords') || '';
            this._keywords = raw.split('\n').filter(Boolean).map(k => {
                if (k.startsWith('/') && k.length > 1) {
                    try { return new RegExp(k.slice(1), 'i'); } catch { return k; }
                }
                return k;
            });

            GM_registerMenuCommand('关键字管理', () => this._openManager(ctx));
        },
        _openManager(ctx) {
            const raw = ctx.getValue('tb__keywords') || '';
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', inset: '0', background: 'rgba(0,0,0,.5)', zIndex: '100001',
                display: 'flex', justifyContent: 'center', alignItems: 'center'
            });
            overlay.innerHTML = `
                <div style="background:#fff;border-radius:12px;padding:24px;width:400px;max-height:70vh;overflow-y:auto">
                    <h3 style="margin:0 0 12px">关键字管理</h3>
                    <p style="font-size:13px;color:#999;margin-bottom:12px">每行一个关键字，以 / 开头表示正则表达式</p>
                    <textarea id="tb__kw_textarea" style="width:100%;height:200px;border:1px solid #d9d9d9;border-radius:6px;padding:8px;font-size:13px;resize:vertical">${raw}</textarea>
                    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
                        <button class="tb__btn" id="tb__kw_cancel">取消</button>
                        <button class="tb__btn tb__btn-primary" id="tb__kw_save">保存</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
            overlay.querySelector('#tb__kw_cancel').addEventListener('click', () => overlay.remove());
            overlay.querySelector('#tb__kw_save').addEventListener('click', () => {
                const val = overlay.querySelector('#tb__kw_textarea').value;
                ctx.setValue('tb__keywords', val);
                ctx.popMsg('关键字已保存，刷新页面生效');
                overlay.remove();
            });
        },
        renderThreadsFunc(el, ctx) {
            if (!ctx.setting.normal.keywordsBlock || this._keywords.length === 0) return;
            const title = el.querySelector('.threadlist_title a, .j_th_tit')?.textContent || '';
            const abs = el.querySelector('.threadlist_abs, .threadlist_abs_onlyline')?.textContent || '';
            const text = title + ' ' + abs;
            for (const kw of this._keywords) {
                const matched = kw instanceof RegExp ? kw.test(text) : text.includes(kw);
                if (matched) { el.style.display = 'none'; return; }
            }
        },
        renderFormsFunc(el, ctx) {
            if (!ctx.setting.normal.keywordsBlock || this._keywords.length === 0) return;
            const content = el.querySelector('.d_post_content, .j_d_post_content')?.textContent || '';
            for (const kw of this._keywords) {
                const matched = kw instanceof RegExp ? kw.test(content) : content.includes(kw);
                if (matched) { el.style.display = 'none'; return; }
            }
        }
    });

    // =============================================
    //  模块13: MarkAndBan 黑名单
    // =============================================
    script.addModule({
        name: 'MarkAndBan',
        title: '黑名单标记',
        setting: { key: 'markAndBan', title: '黑名单功能', desc: '屏蔽指定用户的帖子和回复', default: true, group: '内容过滤' },
        _banList: {},
        style: `
            .tb__ban-btn{cursor:pointer;font-size:12px;color:#ff4d4f;margin-left:6px;opacity:.6;transition:opacity .2s}
            .tb__ban-btn:hover{opacity:1}
            .tb__mark-tag{display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;margin-left:4px;background:#fff3f3;color:#ff4d4f;border:1px solid #ffccc7}
        `,
        initFunc(ctx) {
            if (!ctx.setting.normal.markAndBan) return;
            try { this._banList = JSON.parse(ctx.getValue('tb__banlist') || '{}'); } catch { this._banList = {}; }
            GM_registerMenuCommand('黑名单管理', () => this._openManager(ctx));
        },
        _openManager(ctx) {
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', inset: '0', background: 'rgba(0,0,0,.5)', zIndex: '100001',
                display: 'flex', justifyContent: 'center', alignItems: 'center'
            });
            const names = Object.keys(this._banList);
            overlay.innerHTML = `
                <div style="background:#fff;border-radius:12px;padding:24px;width:400px;max-height:70vh;overflow-y:auto">
                    <h3 style="margin:0 0 12px">黑名单管理 (${names.length}人)</h3>
                    <div id="tb__ban_list" style="max-height:300px;overflow-y:auto">
                        ${names.length ? names.map(n => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f5f5f5">
                            <span>${n}</span><button class="tb__btn" style="padding:2px 8px;font-size:12px" data-name="${n}">移除</button>
                        </div>`).join('') : '<p style="color:#999;text-align:center">暂无黑名单用户</p>'}
                    </div>
                    <div style="display:flex;gap:8px;margin-top:16px">
                        <input id="tb__ban_input" placeholder="输入用户名" style="flex:1;padding:6px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px">
                        <button class="tb__btn tb__btn-primary" id="tb__ban_add">添加</button>
                    </div>
                    <div style="text-align:right;margin-top:12px"><button class="tb__btn" id="tb__ban_close">关闭</button></div>
                </div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
            overlay.querySelector('#tb__ban_close').addEventListener('click', () => overlay.remove());
            overlay.querySelector('#tb__ban_add').addEventListener('click', () => {
                const name = overlay.querySelector('#tb__ban_input').value.trim();
                if (!name) return;
                this._banList[name] = true;
                ctx.setValue('tb__banlist', JSON.stringify(this._banList));
                ctx.popMsg(`已屏蔽: ${name}`);
                overlay.remove();
            });
            overlay.querySelectorAll('#tb__ban_list button').forEach(btn => {
                btn.addEventListener('click', () => {
                    delete this._banList[btn.dataset.name];
                    ctx.setValue('tb__banlist', JSON.stringify(this._banList));
                    btn.parentElement.remove();
                    ctx.popMsg(`已移除: ${btn.dataset.name}`);
                });
            });
        },
        renderFormsFunc(el, ctx) {
            if (!ctx.setting.normal.markAndBan) return;
            const authorEl = el.querySelector('.p_author_name, .d_name a');
            if (!authorEl) return;
            const name = authorEl.textContent.trim();

            if (!el.querySelector('.tb__ban-btn')) {
                const banBtn = document.createElement('span');
                banBtn.className = 'tb__ban-btn';
                banBtn.textContent = '[屏蔽]';
                banBtn.addEventListener('click', () => {
                    if (!confirm(`确定屏蔽用户 "${name}" 吗？`)) return;
                    this._banList[name] = true;
                    ctx.setValue('tb__banlist', JSON.stringify(this._banList));
                    ctx.popMsg(`已屏蔽: ${name}`);
                    el.style.display = 'none';
                });
                authorEl.parentElement.appendChild(banBtn);
            }

            if (this._banList[name]) {
                el.style.display = 'none';
            }
        },
        renderThreadsFunc(el, ctx) {
            if (!ctx.setting.normal.markAndBan) return;
            const authorEl = el.querySelector('.tb_icon_author, .frs-author-name, [data-field]');
            if (!authorEl) return;
            let name = '';
            try {
                const df = el.getAttribute('data-field');
                if (df) { name = JSON.parse(df).author_name || ''; }
            } catch {}
            if (!name) name = (el.querySelector('.frs-author-name')?.textContent || '').trim();
            if (name && this._banList[name]) el.style.display = 'none';
        }
    });

    // =============================================
    //  模块14: DarkMode 暗黑模式
    // =============================================
    script.addModule({
        name: 'DarkMode',
        title: '暗黑模式',
        setting: { key: 'darkMode', title: '暗黑模式', desc: '深色主题 [快捷键 D]', default: false, group: '主题' },
        style: `
            body.tb__dark-mode{background:#1a1a2e!important;color:#c9d1d9!important}
            body.tb__dark-mode *{border-color:#30363d!important}
            body.tb__dark-mode a{color:#58a6ff!important}
            body.tb__dark-mode a:hover{color:#79c0ff!important}
            body.tb__dark-mode #head,
            body.tb__dark-mode .head_inner,
            body.tb__dark-mode .tbui_header{background:#0d1117!important}
            body.tb__dark-mode .nav_wrap,
            body.tb__dark-mode .forum_head,
            body.tb__dark-mode .search_bright_,
            body.tb__dark-mode .u_ddl{background:#161b22!important}
            body.tb__dark-mode .card_title,
            body.tb__dark-mode .card_title_fname{background:#161b22!important;color:#c9d1d9!important}
            body.tb__dark-mode #thread_list,
            body.tb__dark-mode .threadlist_bright{background:#0d1117!important}
            body.tb__dark-mode .j_thread_list{background:#161b22!important;border-bottom:1px solid #21262d!important}
            body.tb__dark-mode .j_thread_list:hover{background:#1c2333!important}
            body.tb__dark-mode .threadlist_title a{color:#c9d1d9!important}
            body.tb__dark-mode .threadlist_abs,.tb__dark-mode .threadlist_abs_onlyline{color:#8b949e!important}
            body.tb__dark-mode .threadlist_rep_num .red_text,.tb__dark-mode .threadlist_rep_num{color:#8b949e!important}
            body.tb__dark-mode #j_p_postlist,
            body.tb__dark-mode .p_postlist{background:#0d1117!important}
            body.tb__dark-mode .l_post{background:#161b22!important;border-bottom:1px solid #21262d!important}
            body.tb__dark-mode .d_post_content,
            body.tb__dark-mode .j_d_post_content{color:#c9d1d9!important}
            body.tb__dark-mode .d_author{background:#0d1117!important}
            body.tb__dark-mode .core_reply{background:#0d1117!important}
            body.tb__dark-mode .core_reply_wrapper{background:#161b22!important}
            body.tb__dark-mode .lzl_content_main{color:#c9d1d9!important}
            body.tb__dark-mode .p_props_content,.tb__dark-mode .badge_bright{filter:brightness(.8)!important}
            body.tb__dark-mode .pb_footer,
            body.tb__dark-mode .l_pager{background:#161b22!important}
            body.tb__dark-mode .nav_list .nav_item_text,.tb__dark-mode .nav_list a{color:#c9d1d9!important}
            body.tb__dark-mode input,body.tb__dark-mode textarea,body.tb__dark-mode select{background:#0d1117!important;color:#c9d1d9!important;border-color:#30363d!important}
            body.tb__dark-mode .tbui_pagination .pagination-item.active{background:#2932e1!important}
            body.tb__dark-mode .right_section{background:#161b22!important}
            body.tb__dark-mode .content{background:#0d1117!important}
            body.tb__dark-mode .p_thread{background:#161b22!important}
            body.tb__dark-mode .core_title_txt{color:#c9d1d9!important}
            body.tb__dark-mode .d_badge_title{color:#c9d1d9!important}
            body.tb__dark-mode .p_tail,.tb__dark-mode .post-tail-wrap{color:#484f58!important}
            body.tb__dark-mode .p_tail a,.tb__dark-mode .post-tail-wrap a{color:#484f58!important}
            body.tb__dark-mode #tb__setting_panel{background:#161b22!important;color:#c9d1d9!important}
            body.tb__dark-mode .tb__panel-header{background:#161b22!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__panel-header h3{color:#c9d1d9!important}
            body.tb__dark-mode .tb__panel-tab{color:#8b949e!important}
            body.tb__dark-mode .tb__panel-tab.active{color:#58a6ff!important;border-bottom-color:#58a6ff!important}
            body.tb__dark-mode .tb__setting-item label{color:#c9d1d9!important}
            body.tb__dark-mode .tb__setting-item{border-color:#21262d!important}
            body.tb__dark-mode .tb__panel-footer{background:#161b22!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__btn{background:#21262d!important;color:#c9d1d9!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__btn-primary{background:#2932e1!important;color:#fff!important;border-color:#2932e1!important}
            body.tb__dark-mode .tb__docker-btn{background:#21262d!important;color:#c9d1d9!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__quote-expand{background:#21262d!important;color:#58a6ff!important}
            body.tb__dark-mode .tb__quote-folded::after{background:linear-gradient(transparent,#161b22)!important}
            body.tb__dark-mode .forum_content,.tb__dark-mode .left_section{background:#0d1117!important}
            body.tb__dark-mode img.BDE_Image{opacity:.85}
            body.tb__dark-mode .tb__excel-overlay{background:#1a1a2e!important;color:#c9d1d9!important}
            body.tb__dark-mode .tb__excel-toolbar{background:#0d4429!important}
            body.tb__dark-mode .tb__excel-ribbon{background:#161b22!important;border-color:#30363d!important;color:#c9d1d9!important}
            body.tb__dark-mode .tb__excel-ribbon select,.tb__dark-mode .tb__excel-ribbon input{background:#0d1117!important;color:#c9d1d9!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__excel-formula{background:#0d1117!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__excel-formula .tb__formula-name{background:#161b22!important;color:#c9d1d9!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__excel-formula .tb__formula-input{background:#0d1117!important;color:#c9d1d9!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__excel-table th{background:#161b22!important;color:#8b949e!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__excel-table td{color:#c9d1d9!important;border-color:#21262d!important}
            body.tb__dark-mode .tb__excel-table tr:hover td{background:#1c2333!important}
            body.tb__dark-mode .tb__excel-table .tb__row-num{background:#161b22!important;color:#484f58!important}
            body.tb__dark-mode .tb__excel-table td a{color:#58a6ff!important}
            body.tb__dark-mode .tb__excel-footer{background:#161b22!important;border-color:#30363d!important;color:#8b949e!important}
            body.tb__dark-mode .tb__excel-footer .tb__sheet-tab{background:#0d1117!important;color:#c9d1d9!important;border-color:#30363d!important}
            body.tb__dark-mode .tb__excel-footer .tb__sheet-tab.active{border-bottom-color:#3fb950!important}
            body.tb__dark-mode .tb__excel-footer .tb__sheet-tab:hover{background:#1c2333!important}
            body.tb__dark-mode .tb__excel-footer .tb__sheet-tab.tb__sheet-nav{background:#1c2a1e!important;color:#3fb950!important;border-color:#2d4a33!important}
            body.tb__dark-mode .tb__excel-footer .tb__sheet-tab.tb__sheet-post{background:#2a2000!important;color:#d29922!important;border-color:#4a3800!important}
            body.tb__dark-mode .tb__excel-footer .tb__sheet-tab.tb__sheet-post.active{border-bottom-color:#d29922!important}
            body.tb__dark-mode .tb__lzl-toggle{background:#1c2a1e!important;color:#3fb950!important;border-color:#2d4a33!important}
            body.tb__dark-mode .tb__lzl-toggle:hover{background:#2d4a33!important}
            body.tb__dark-mode .tb__lzl-row td{background:#0d1117!important;border-color:#21262d!important;color:#8b949e!important}
            body.tb__dark-mode .tb__lzl-row:hover td{background:#161b22!important}
            body.tb__dark-mode .tb__lzl-author{color:#58a6ff!important}
            body.tb__dark-mode .tb__lzl-reply-label{color:#484f58!important}
            body.tb__dark-mode .tb__lzl-reply-to{color:#d29922!important}
            body.tb__dark-mode .tb__lzl-arrow{color:#484f58!important}
            body.tb__dark-mode .tb__lzl-time{color:#484f58!important}
            body.tb__dark-mode .tb__lzl-content{background:#0d1117!important}
        `,
        initFunc(ctx) {
            if (ctx.getValue('tb__rt_darkMode') === 'true' || ctx.setting.normal.darkMode) document.body.classList.add('tb__dark-mode');
            ctx.getModule('ShortCutKeys').register('D', '暗黑模式', () => {
                document.body.classList.toggle('tb__dark-mode');
                const on = document.body.classList.contains('tb__dark-mode');
                if (on) {
                    document.body.classList.remove('tb__eye-care');
                    ctx.setValue('tb__rt_eyeCareMode', 'false');
                }
                ctx.setValue('tb__rt_darkMode', on ? 'true' : 'false');
                ctx.popNotification(on ? '暗黑模式已开启' : '暗黑模式已关闭');
            });
        }
    });

    // =============================================
    //  模块15: EyeCareMode 护眼模式
    // =============================================
    script.addModule({
        name: 'EyeCareMode',
        title: '护眼模式',
        setting: { key: 'eyeCareMode', title: '护眼模式', desc: '绿色护眼主题', default: false, group: '主题' },
        style: `
            body.tb__eye-care{background:#c7edcc!important}
            body.tb__eye-care #head,body.tb__eye-care .head_inner,body.tb__eye-care .tbui_header{background:#a8d8b0!important}
            body.tb__eye-care .j_thread_list{background:#d4edda!important}
            body.tb__eye-care .j_thread_list:hover{background:#c3e6cb!important}
            body.tb__eye-care .l_post{background:#d4edda!important}
            body.tb__eye-care .content,.tb__eye-care .forum_content,.tb__eye-care .left_section{background:#c7edcc!important}
            body.tb__eye-care .right_section{background:#d4edda!important}
            body.tb__eye-care #thread_list,.tb__eye-care .threadlist_bright{background:#c7edcc!important}
            body.tb__eye-care .d_author{background:#b8e0bf!important}
            body.tb__eye-care .core_reply{background:#b8e0bf!important}
            body.tb__eye-care .core_reply_wrapper{background:#d4edda!important}
            body.tb__eye-care .card_title,.tb__eye-care .card_title_fname{background:#b8e0bf!important}
            body.tb__eye-care .pb_footer,.tb__eye-care .l_pager{background:#d4edda!important}
            body.tb__eye-care #j_p_postlist,.tb__eye-care .p_postlist{background:#c7edcc!important}
            body.tb__eye-care #tb__setting_panel{background:#d4edda!important}
            body.tb__eye-care .tb__panel-header{background:#d4edda!important}
            body.tb__eye-care .tb__panel-footer{background:#d4edda!important}
            body.tb__eye-care .tb__docker-btn{background:#d4edda!important}
        `,
        initFunc(ctx) {
            if (ctx.getValue('tb__rt_eyeCareMode') === 'true' || ctx.setting.normal.eyeCareMode) {
                document.body.classList.add('tb__eye-care');
                document.body.classList.remove('tb__dark-mode');
            }
        }
    });

    // =============================================
    //  模块16: ExcelMode Excel伪装
    // =============================================
    script.addModule({
        name: 'ExcelMode',
        title: 'Excel伪装模式',
        setting: { key: 'excelMode', title: 'Excel伪装模式', desc: '将页面伪装为Excel表格 [快捷键 R]', default: false, group: '界面优化' },
        _active: false,
        style: `
            .tb__excel-overlay{position:fixed;inset:0;z-index:99999;background:#fff;overflow-y:auto;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;display:none}
            .tb__excel-overlay.active{display:block}
            .tb__excel-toolbar{background:#217346;color:#fff;padding:4px 12px;display:flex;align-items:center;gap:16px;font-size:13px;position:sticky;top:0;z-index:1}
            .tb__excel-toolbar .tb__excel-logo{font-weight:bold;font-size:15px;margin-right:8px}
            .tb__excel-toolbar .tb__excel-menu{display:flex;gap:2px}
            .tb__excel-toolbar .tb__excel-menu span{padding:4px 10px;cursor:pointer;border-radius:3px}
            .tb__excel-toolbar .tb__excel-menu span:hover{background:rgba(255,255,255,.15)}
            .tb__excel-ribbon{background:#f3f3f3;border-bottom:1px solid #d4d4d4;padding:4px 12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#333;position:sticky;top:32px;z-index:1}
            .tb__excel-ribbon select,.tb__excel-ribbon input{border:1px solid #ccc;border-radius:2px;padding:2px 4px;font-size:12px;background:#fff}
            .tb__excel-ribbon .tb__ribbon-sep{width:1px;height:20px;background:#ccc;margin:0 4px}
            .tb__excel-ribbon .tb__ribbon-btn{padding:2px 6px;cursor:pointer;border-radius:2px}
            .tb__excel-ribbon .tb__ribbon-btn:hover{background:#e0e0e0}
            .tb__excel-formula{display:flex;align-items:center;border-bottom:1px solid #d4d4d4;padding:2px 8px;background:#fff;position:sticky;top:64px;z-index:1}
            .tb__excel-formula .tb__formula-name{background:#f3f3f3;border:1px solid #ccc;border-right:none;padding:2px 8px;font-size:12px;min-width:40px;text-align:center}
            .tb__excel-formula .tb__formula-input{flex:1;border:1px solid #ccc;padding:2px 8px;font-size:12px;outline:none}
            .tb__excel-table{width:100%;border-collapse:collapse;font-size:13px}
            .tb__excel-table th{background:#f3f3f3;border:1px solid #c6c6c6;padding:3px 8px;font-weight:normal;color:#333;text-align:center;position:sticky;white-space:nowrap;min-width:30px}
            .tb__excel-table td{border:1px solid #d4d4d4;padding:4px 8px;color:#333;vertical-align:top}
            .tb__excel-table tr:hover td{background:#e8f0fe}
            .tb__excel-table .tb__row-num{background:#f3f3f3;text-align:center;color:#666;width:40px;min-width:40px}
            .tb__excel-table td a{color:#0563C1!important;text-decoration:underline}
            .tb__excel-table td a:hover{color:#0366d6!important}
            .tb__lzl-toggle{display:inline-block;margin-top:4px;padding:1px 6px;font-size:11px;color:#217346;background:#edf7f0;border:1px solid #c3e6cb;border-radius:3px;cursor:pointer;user-select:none;white-space:nowrap}
            .tb__lzl-toggle:hover{background:#d4edda;color:#155724}
            .tb__lzl-row td{background:#f7faff!important;border-color:#e8eef5!important;font-size:12px}
            .tb__lzl-row:hover td{background:#eef4ff!important}
            .tb__lzl-author{color:#1a73e8}
            .tb__lzl-reply-label{color:#999}
            .tb__lzl-reply-to{color:#e67700}
            .tb__lzl-arrow{color:#bbb;font-size:11px}
            .tb__lzl-time{font-size:11px;color:#999}
            .tb__lzl-content{font-size:12px;background:#fafcff}
            .tb__excel-footer{background:#f3f3f3;border-top:1px solid #d4d4d4;padding:4px 12px;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#666;position:sticky;bottom:0;z-index:1}
            .tb__excel-footer .tb__sheet-tabs{display:flex;gap:0;overflow-x:auto;max-width:calc(100% - 80px);scrollbar-width:none}
            .tb__excel-footer .tb__sheet-tabs::-webkit-scrollbar{display:none}
            .tb__excel-footer .tb__sheet-tab{padding:4px 14px;background:#fff;border:1px solid #ccc;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;flex-shrink:0;transition:all .15s;font-size:12px}
            .tb__excel-footer .tb__sheet-tab:hover{background:#e8f0fe}
            .tb__excel-footer .tb__sheet-tab.active{border-bottom-color:#217346;font-weight:600;background:#fff}
            .tb__excel-footer .tb__sheet-tab.tb__sheet-loading{color:#999;font-style:italic}
            .tb__excel-footer .tb__sheet-tab.tb__sheet-nav{background:#e8f5e9;color:#217346;font-weight:600;border-color:#a5d6a7}
            .tb__excel-footer .tb__sheet-tab.tb__sheet-post{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff8e1;color:#8d6e00;border-color:#ffe082}
            .tb__excel-footer .tb__sheet-tab.tb__sheet-post.active{border-bottom-color:#f9a825;background:#fff8e1}
        `,
        _sheetCache: {},
        _currentSheet: '__home__',
        _bars: [],
        initFunc(ctx) {
            const persisted = ctx.getValue('tb__rt_excelMode');
            if (persisted === 'true' || persisted === true) this._active = true;
            else if (ctx.setting.normal.excelMode) this._active = true;
            ctx.getModule('ShortCutKeys').register('R', 'Excel模式', () => {
                this._active = !this._active;
                ctx.setValue('tb__rt_excelMode', this._active ? 'true' : 'false');
                this._toggle(ctx);
                ctx.popNotification(this._active ? 'Excel模式已开启' : 'Excel模式已关闭');
            });
        },
        postProcFunc(ctx) {
            if (this._active) {
                this._toggle(ctx);
                if (ctx.isForms() && this._sheetCache['__home__']?.rows?.length === 0) {
                    setTimeout(() => {
                        this._sheetCache = {};
                        this._bars = [];
                        this._toggle(ctx);
                    }, 1500);
                }
            }
        },
        _getPageType(ctx) {
            if (ctx.isForms()) return 'forms';
            if (ctx.isThreads()) return 'threads';
            return 'home';
        },
        _collectBars() {
            if (this._bars.length) return this._bars;
            const seen = new Set();
            const bars = [];
            const addBar = (a) => {
                const m = a.href && a.href.match(/kw=([^&]+)/);
                if (!m) return;
                const kw = decodeURIComponent(m[1]);
                if (seen.has(kw) || !kw) return;
                seen.add(kw);
                bars.push({ name: kw, kw, href: a.href });
            };
            document.querySelectorAll('.e_myforum a[href*="/f?kw="], .my_tieba_mod a[href*="/f?kw="], .sug_list a[href*="/f?kw="], .forum_table a[href*="/f?kw="]').forEach(addBar);
            if (!bars.length) {
                document.querySelectorAll('a[href*="/f?kw="]').forEach(a => {
                    const txt = a.textContent.trim();
                    if (!txt || /\d+\.?\d*[WwKk万千]/.test(txt)) return;
                    addBar(a);
                });
            }
            this._bars = bars.slice(0, 20);
            return this._bars;
        },
        _toggle(ctx) {
            this._ctx = ctx;
            let overlay = document.getElementById('tb__excel_overlay');
            if (!this._active) {
                if (overlay) overlay.classList.remove('active');
                document.title = this._origTitle || document.title;
                return;
            }
            this._origTitle = this._origTitle || document.title;
            document.title = 'Book1 - Excel Online';

            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'tb__excel_overlay';
                overlay.className = 'tb__excel-overlay';
                document.body.appendChild(overlay);
            }
            overlay.classList.add('active');

            const bars = this._collectBars();
            const pageType = this._getPageType(ctx);

            let sheetLabel = '首页';
            if (pageType === 'threads') sheetLabel = '帖子列表';
            else if (pageType === 'forms') sheetLabel = '帖子内容';

            this._currentSheet = '__home__';
            const rows = this._collectData(ctx, pageType);
            this._sheetCache['__home__'] = { rows, type: pageType };

            const isNotHome = pageType !== 'home';
            let barTabsHTML = '';
            if (isNotHome) {
                barTabsHTML += `<div class="tb__sheet-tab tb__sheet-nav" data-href="https://tieba.baidu.com/" title="返回首页">🏠 首页</div>`;
            }
            barTabsHTML += `<div class="tb__sheet-tab active" data-sheet="__home__">${sheetLabel}</div>`;
            bars.forEach(b => {
                barTabsHTML += `<div class="tb__sheet-tab" data-sheet="${this._escapeAttr(b.kw)}" data-href="${this._escapeAttr(b.href)}">${this._escapeHtml(b.name)}</div>`;
            });

            overlay.innerHTML = `
                <div class="tb__excel-toolbar">
                    <span class="tb__excel-logo">☰ Excel Online</span>
                    <div class="tb__excel-menu">
                        <span>文件</span><span>开始</span><span>插入</span><span>页面布局</span><span>公式</span><span>数据</span><span>审阅</span><span>视图</span>
                    </div>
                    <span style="margin-left:auto;cursor:pointer" id="tb__excel_close" title="退出Excel模式">✕ 退出</span>
                </div>
                <div class="tb__excel-ribbon">
                    <select><option>等线</option><option>宋体</option><option>微软雅黑</option></select>
                    <select><option>11</option><option>12</option><option>14</option></select>
                    <span class="tb__ribbon-sep"></span>
                    <span class="tb__ribbon-btn"><b>B</b></span>
                    <span class="tb__ribbon-btn"><i>I</i></span>
                    <span class="tb__ribbon-btn"><u>U</u></span>
                    <span class="tb__ribbon-sep"></span>
                    <span class="tb__ribbon-btn">🔤</span>
                    <span class="tb__ribbon-btn">🎨</span>
                    <span class="tb__ribbon-sep"></span>
                    <span class="tb__ribbon-btn">≡</span>
                    <span class="tb__ribbon-btn">⫶</span>
                </div>
                <div class="tb__excel-formula">
                    <div class="tb__formula-name">A1</div>
                    <input class="tb__formula-input" value="" readonly>
                </div>
                <div id="tb__excel_content"></div>
                <div class="tb__excel-footer">
                    <div class="tb__sheet-tabs" id="tb__sheet_tabs">${barTabsHTML}</div>
                    <span id="tb__row_count">共 ${rows.length} 行</span>
                </div>`;

            this._renderTable(overlay, rows, pageType);

            overlay.querySelector('#tb__excel_close').addEventListener('click', () => {
                this._active = false;
                ctx.setValue('tb__rt_excelMode', 'false');
                this._toggle(ctx);
            });

            overlay.querySelectorAll('#tb__sheet_tabs .tb__sheet-tab').forEach(tab => {
                if (tab.classList.contains('tb__sheet-nav')) {
                    tab.addEventListener('click', () => { location.href = tab.dataset.href; });
                } else {
                    tab.addEventListener('click', () => this._switchSheet(tab, overlay, ctx));
                }
            });
        },
        _renderTable(overlay, rows, type) {
            const headerMap = {
                threads: ['', '序号', '标题', '作者', '回复', '最后回复'],
                forms: ['', '楼层', '作者', '内容', '时间'],
                home: ['', '序号', '来源', '标题', '摘要', '作者', '时间']
            };
            const colHeaders = headerMap[type] || headerMap.home;
            let tableHTML = '<tr>' + colHeaders.map(h => `<th>${h}</th>`).join('') + '</tr>';
            rows.forEach((row, idx) => {
                tableHTML += `<tr><td class="tb__row-num">${idx + 1}</td>${row.map(c => `<td>${c}</td>`).join('')}</tr>`;
            });

            const content = overlay.querySelector('#tb__excel_content');
            content.innerHTML = `<table class="tb__excel-table">${tableHTML}</table>`;

            const countEl = overlay.querySelector('#tb__row_count');
            if (countEl) countEl.textContent = `共 ${rows.length} 行`;

            if (!content._tbClickBound) {
                content._tbClickBound = true;
                content.addEventListener('click', (e) => {
                    const toggle = e.target.closest('.tb__lzl-toggle');
                    if (toggle) {
                        e.stopPropagation();
                        this._loadFloorComments(toggle);
                        return;
                    }
                    const link = e.target.closest('a[href]');
                    if (link && /\/p\/\d+/.test(link.href)) {
                        e.preventDefault();
                        e.stopPropagation();
                        const title = link.textContent.trim();
                        this._openPost(link.href, title, overlay);
                        return;
                    }
                    const td = e.target.closest('td');
                    if (td && content.contains(td)) {
                        content.querySelectorAll('.tb__excel-table td').forEach(t => t.style.outline = '');
                        td.style.outline = '2px solid #217346';
                        const fi = overlay.querySelector('.tb__formula-input');
                        if (fi) fi.value = td.textContent.slice(0, 200);
                    }
                });
            }
        },
        async _openPost(href, title, overlay) {
            const ctx = this._ctx;
            const postKey = '__post__' + href.replace(/[?#].*$/, '');
            const maxLabel = 18;
            const tabTitle = title.length > maxLabel ? title.slice(0, maxLabel) + '...' : title;

            const tabsContainer = overlay.querySelector('#tb__sheet_tabs');
            let postTab = tabsContainer.querySelector(`.tb__sheet-tab[data-sheet="${CSS.escape(postKey)}"]`);
            if (!postTab) {
                const existingPostTabs = tabsContainer.querySelectorAll('.tb__sheet-tab.tb__sheet-post');
                if (existingPostTabs.length >= 5) {
                    const oldest = existingPostTabs[0];
                    delete this._sheetCache[oldest.dataset.sheet];
                    oldest.remove();
                }
                postTab = document.createElement('div');
                postTab.className = 'tb__sheet-tab tb__sheet-post';
                postTab.dataset.sheet = postKey;
                postTab.dataset.href = href;
                postTab.title = title;
                postTab.textContent = tabTitle;
                const homeTab = tabsContainer.querySelector('.tb__sheet-tab[data-sheet="__home__"]');
                if (homeTab && homeTab.nextSibling) {
                    tabsContainer.insertBefore(postTab, homeTab.nextSibling);
                } else {
                    tabsContainer.appendChild(postTab);
                }
                postTab.addEventListener('click', () => this._switchSheet(postTab, overlay, ctx));
            }

            tabsContainer.querySelectorAll('.tb__sheet-tab').forEach(t => t.classList.remove('active'));
            postTab.classList.add('active');
            this._currentSheet = postKey;

            if (this._sheetCache[postKey]) {
                this._renderTable(overlay, this._sheetCache[postKey].rows, 'forms');
                return;
            }

            const content = overlay.querySelector('#tb__excel_content');
            content.innerHTML = '<div style="text-align:center;padding:40px;color:#999;font-size:14px">加载中...</div>';
            postTab.classList.add('tb__sheet-loading');

            try {
                const resp = await fetch(href, { credentials: 'include' });
                const html = await resp.text();
                const uncommented = html.replace(/<!--/g, '').replace(/-->/g, '');
                const parser = new DOMParser();
                const doc = parser.parseFromString(uncommented, 'text/html');
                const rows = [];
                const posts = doc.querySelectorAll('.l_post');
                const tidMatch = href.match(/\/p\/(\d+)/);
                const tid = tidMatch ? tidMatch[1] : '';

                posts.forEach((el, i) => {
                    let author = '', pid = '', commentNum = 0;
                    try {
                        const df = el.getAttribute('data-field');
                        if (df) {
                            const parsed = JSON.parse(df);
                            author = parsed.author?.user_name || '';
                            pid = parsed.content?.post_id || '';
                            commentNum = parseInt(parsed.content?.comment_num) || 0;
                        }
                    } catch {}
                    if (!author) author = el.querySelector('.p_author_name, .d_name a')?.textContent?.trim() || '';
                    const contentEl = el.querySelector('.d_post_content, .j_d_post_content, .p_content');
                    if (contentEl) {
                        contentEl.querySelectorAll('.lzl_panel_container, .core_reply_wrapper, [class*="fold"], [class*="blocked"]').forEach(n => n.remove());
                    }
                    let postContent = this._processContent(contentEl);
                    postContent = postContent.replace(/该楼层疑似违规已被系统折叠/g, '')
                        .replace(/隐藏此楼/g, '').replace(/查看此楼/g, '')
                        .replace(/^\s+/, '');
                    if (commentNum > 0 && pid && tid) {
                        postContent += ` <span class="tb__lzl-toggle" data-pid="${pid}" data-tid="${tid}" data-count="${commentNum}">▶ 展开回复(${commentNum})</span>`;
                    }
                    const tail = el.querySelector('.post-tail-wrap span, .p_tail, .acore_reply_tail')?.textContent?.trim() || '';
                    rows.push([`${i + 1}楼`, author, postContent, tail]);
                });

                this._sheetCache[postKey] = { rows, type: 'forms' };
                postTab.classList.remove('tb__sheet-loading');
                if (this._currentSheet === postKey) {
                    this._renderTable(overlay, rows, 'forms');
                }
            } catch (e) {
                console.error('Post load failed:', e);
                postTab.classList.remove('tb__sheet-loading');
                if (this._currentSheet === postKey) {
                    content.innerHTML = '<div style="text-align:center;padding:40px;color:#ff4d4f;font-size:14px">加载失败，请重试</div>';
                }
            }
        },
        async _switchSheet(tab, overlay, ctx) {
            const sheetKey = tab.dataset.sheet;
            if (sheetKey === this._currentSheet) return;

            overlay.querySelectorAll('#tb__sheet_tabs .tb__sheet-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            this._currentSheet = sheetKey;

            if (sheetKey === '__home__') {
                const cached = this._sheetCache['__home__'];
                this._renderTable(overlay, cached.rows, cached.type);
                return;
            }

            if (this._sheetCache[sheetKey]) {
                const cached = this._sheetCache[sheetKey];
                this._renderTable(overlay, cached.rows, cached.type || 'threads');
                return;
            }

            const content = overlay.querySelector('#tb__excel_content');
            content.innerHTML = '<div style="text-align:center;padding:40px;color:#999;font-size:14px">加载中...</div>';

            try {
                const url = tab.dataset.href || `https://tieba.baidu.com/f?kw=${encodeURIComponent(sheetKey)}`;
                const resp = await fetch(url, { credentials: 'include' });
                const html = await resp.text();
                const uncommented = html.replace(/<!--/g, '').replace(/-->/g, '');
                const parser = new DOMParser();
                const doc = parser.parseFromString(uncommented, 'text/html');
                const rows = [];

                doc.querySelectorAll('.j_thread_list[data-field]').forEach((el, i) => {
                    let title = '', href = '', author = '', reply = '0';
                    const titleLink = el.querySelector('.threadlist_title a, a.j_th_tit');
                    const titleText = el.querySelector('.j_th_tit') || titleLink;
                    if (titleText) title = titleText.textContent.trim();
                    if (titleLink) {
                        href = titleLink.getAttribute('href') || '';
                        if (href && !href.startsWith('http')) href = 'https://tieba.baidu.com' + href;
                    }
                    if (!href) {
                        try {
                            const df = el.getAttribute('data-field');
                            if (df) {
                                const parsed = JSON.parse(df);
                                if (parsed.id) href = 'https://tieba.baidu.com/p/' + parsed.id;
                                if (!author && parsed.author_name) author = parsed.author_name;
                            }
                        } catch {}
                    }
                    if (!author) {
                        try {
                            const df = el.getAttribute('data-field');
                            if (df) author = JSON.parse(df).author_name || '';
                        } catch {}
                    }
                    if (!author) author = el.querySelector('.frs-author-name')?.textContent?.trim() || '';
                    reply = el.querySelector('.threadlist_rep_num .red_text, .threadlist_rep_num span')?.textContent?.trim() || '0';
                    const last = el.querySelector('.threadlist_author .frs-author-name-wrap .frs-author-name, .is_show_create_time')?.textContent?.trim() || '';

                    let imgHtml = '';
                    el.querySelectorAll('.threadlist_media img, .threadlist_pic img').forEach(img => {
                        const src = img.getAttribute('data-original') || img.getAttribute('original') || img.getAttribute('bpic') || img.src || '';
                        if (src && !src.includes('data:image')) {
                            imgHtml += ` <span class="tb__img-tag">[图片]</span><img class="tb__excel-img" src="${this._escapeAttr(src)}">`;
                        }
                    });

                    if (title) {
                        const titleCell = href
                            ? `<a href="${this._escapeAttr(href)}">${this._escapeHtml(title)}</a>${imgHtml}`
                            : `${this._escapeHtml(title)}${imgHtml}`;
                        rows.push([`${i + 1}`, titleCell, author, reply, last]);
                    }
                });

                this._sheetCache[sheetKey] = { rows, type: 'threads' };
                if (this._currentSheet === sheetKey) {
                    this._renderTable(overlay, rows, 'threads');
                }
            } catch (e) {
                console.error('Sheet load failed:', e);
                if (this._currentSheet === sheetKey) {
                    content.innerHTML = '<div style="text-align:center;padding:40px;color:#ff4d4f;font-size:14px">加载失败，请重试</div>';
                }
            }
        },
        _parseLzlPost(post) {
            let author = '';
            try {
                const df = post.getAttribute('data-field');
                if (df) author = JSON.parse(df).user_name || '';
            } catch {}
            if (!author) {
                const authorEl = post.querySelector('.lzl_cnt > .at, .lzl_cnt > a.j_user_card');
                author = authorEl?.textContent?.trim() || '';
            }
            if (!author) author = post.querySelector('.at, .j_user_card')?.textContent?.trim() || '';

            const contentEl = post.querySelector('.lzl_content_main');
            let replyTo = '', text = '';
            if (contentEl) {
                const replyLink = contentEl.querySelector('.at, a.j_user_card');
                const rawText = contentEl.textContent?.trim() || '';
                if (replyLink) {
                    replyTo = replyLink.textContent.trim();
                    const replyPattern = new RegExp(`^\\s*回复\\s*${replyTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：]?\\s*`);
                    text = rawText.replace(replyPattern, '').trim();
                } else {
                    text = rawText;
                }
            }

            const time = post.querySelector('.lzl_time, .lzl_s_p_time')?.textContent?.trim() || '';
            return { author, replyTo, text, time };
        },
        async _loadFloorComments(toggle) {
            const pid = toggle.dataset.pid;
            const tid = toggle.dataset.tid;
            const count = parseInt(toggle.dataset.count) || 0;
            const tr = toggle.closest('tr');
            if (!tr) return;

            const existing = [];
            let sibling = tr.nextElementSibling;
            while (sibling && sibling.classList.contains('tb__lzl-row') && sibling.dataset.parentPid === pid) {
                existing.push(sibling);
                sibling = sibling.nextElementSibling;
            }
            if (existing.length > 0) {
                const hidden = existing[0].style.display === 'none';
                existing.forEach(r => r.style.display = hidden ? '' : 'none');
                toggle.textContent = hidden ? `▼ 收起回复(${count})` : `▶ 展开回复(${count})`;
                return;
            }

            toggle.textContent = `⏳ 加载中...`;
            try {
                let allReplies = [];

                const pageContainer = document.querySelector(`.j_lzl_container[data-field*='"pid":${pid}'], .j_lzl_container[data-field*='"pid":"${pid}"']`);
                if (pageContainer) {
                    pageContainer.querySelectorAll('.lzl_single_post').forEach(post => {
                        const r = this._parseLzlPost(post);
                        if (r.author || r.text) allReplies.push(r);
                    });
                }

                if (allReplies.length === 0) {
                    const totalPages = Math.ceil(count / 10);
                    for (let pn = 1; pn <= Math.min(totalPages, 5); pn++) {
                        const url = `https://tieba.baidu.com/p/comment?tid=${tid}&pid=${pid}&pn=${pn}`;
                        const resp = await fetch(url, { credentials: 'include' });
                        const html = await resp.text();
                        const uncommented = html.replace(/<!--/g, '').replace(/-->/g, '');
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(uncommented, 'text/html');
                        doc.querySelectorAll('.lzl_single_post, .lzl_single_post_old').forEach(post => {
                            const r = this._parseLzlPost(post);
                            if (r.author || r.text) allReplies.push(r);
                        });
                    }
                }

                if (allReplies.length === 0) {
                    toggle.textContent = `▶ 暂无回复`;
                    return;
                }

                const colCount = tr.querySelectorAll('td').length;
                const frag = document.createDocumentFragment();
                allReplies.forEach(r => {
                    const subRow = document.createElement('tr');
                    subRow.className = 'tb__lzl-row';
                    subRow.dataset.parentPid = pid;
                    const replyInfo = r.replyTo
                        ? `<span class="tb__lzl-author">${this._escapeHtml(r.author)}</span> <span class="tb__lzl-reply-label">回复</span> <span class="tb__lzl-reply-to">${this._escapeHtml(r.replyTo)}</span>`
                        : `<span class="tb__lzl-author">${this._escapeHtml(r.author)}</span>`;
                    subRow.innerHTML =
                        `<td class="tb__row-num"></td>` +
                        `<td style="text-align:center" class="tb__lzl-arrow">↳</td>` +
                        `<td style="white-space:nowrap">${replyInfo}</td>` +
                        `<td class="tb__lzl-content">${this._escapeHtml(r.text)}</td>` +
                        `<td class="tb__lzl-time" style="white-space:nowrap">${this._escapeHtml(r.time)}</td>`;
                    const extra = colCount - 5;
                    for (let k = 0; k < extra; k++) subRow.insertAdjacentHTML('beforeend', '<td></td>');
                    frag.appendChild(subRow);
                });

                tr.after(frag);
                toggle.textContent = `▼ 收起回复(${count})`;
            } catch (e) {
                console.error('Load comments failed:', e);
                toggle.textContent = `▶ 加载失败，点击重试(${count})`;
                toggle.dataset.count = count;
            }
        },
        _processContent(el) {
            if (!el) return '';
            const parts = [];
            let textLen = 0;
            const walk = (node) => {
                if (textLen > 400) return;
                if (node.nodeType === Node.TEXT_NODE) {
                    const t = node.textContent.trim();
                    if (t) { parts.push(this._escapeHtml(t)); textLen += t.length; }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName;
                    if (tag === 'IMG') {
                        const src = node.getAttribute('origin-src') || node.getAttribute('data-original') || node.src || '';
                        if (src && !src.includes('data:image') && !node.classList.contains('smile')) {
                            parts.push(`<span class="tb__img-tag">[图片]</span><img class="tb__excel-img" src="${this._escapeAttr(src)}">`);
                        } else if (node.classList.contains('smile')) {
                            const alt = node.alt || '';
                            parts.push(alt ? `[${this._escapeHtml(alt)}]` : '[表情]');
                        }
                    } else if (tag === 'BR') {
                        parts.push(' ');
                    } else if (tag === 'A') {
                        const href = node.href || '';
                        const text = node.textContent.trim();
                        if (text && href) { parts.push(`<a href="${this._escapeAttr(href)}">${this._escapeHtml(text)}</a>`); textLen += text.length; }
                        else if (text) { parts.push(this._escapeHtml(text)); textLen += text.length; }
                    } else if (tag === 'VIDEO') {
                        parts.push('<span class="tb__img-tag">[视频]</span>');
                    } else {
                        for (const child of node.childNodes) walk(child);
                    }
                }
            };
            for (const child of el.childNodes) walk(child);
            let result = parts.join(' ').replace(/\s{2,}/g, ' ').trim();
            if (result.length > 500) result = result.slice(0, 500) + '...';
            return result;
        },
        _escapeHtml(s) {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        },
        _escapeAttr(s) {
            return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
        _collectData(ctx, pageType) {
            const rows = [];
            if (pageType === 'threads') {
                ctx.$$('.j_thread_list').forEach((el, i) => {
                    const titleLink = el.querySelector('.threadlist_title a, a.j_th_tit');
                    const titleText = el.querySelector('.j_th_tit') || titleLink;
                    const title = titleText?.textContent?.trim() || '';
                    let href = titleLink?.href || '';
                    if (!href) {
                        try {
                            const df = el.getAttribute('data-field');
                            if (df) { const id = JSON.parse(df).id; if (id) href = 'https://tieba.baidu.com/p/' + id; }
                        } catch {}
                    }
                    let author = '';
                    try {
                        const df = el.getAttribute('data-field');
                        if (df) author = JSON.parse(df).author_name || '';
                    } catch {}
                    if (!author) author = el.querySelector('.frs-author-name')?.textContent?.trim() || '';
                    const reply = el.querySelector('.threadlist_rep_num .red_text, .threadlist_rep_num span')?.textContent?.trim() || '0';
                    const last = el.querySelector('.threadlist_author .frs-author-name-wrap .frs-author-name, .is_show_create_time')?.textContent?.trim() || '';
                    if (title) {
                        const cell = href ? `<a href="${href}">${title}</a>` : title;
                        rows.push([`${i + 1}`, cell, author, reply, last]);
                    }
                });
            } else if (pageType === 'forms') {
                let posts = Array.from(document.querySelectorAll('.l_post.j_l_post'));
                if (!posts.length) {
                    const container = document.getElementById('j_p_postlist') || document.querySelector('#pb_content');
                    if (container) {
                        const raw = container.innerHTML.replace(/<!--/g, '').replace(/-->/g, '');
                        const temp = document.createElement('div');
                        temp.innerHTML = raw;
                        posts = Array.from(temp.querySelectorAll('.l_post'));
                    }
                }
                const tidMatch = location.href.match(/\/p\/(\d+)/);
                const tid = tidMatch ? tidMatch[1] : '';
                posts.forEach((el, i) => {
                    let author = '', pid = '', commentNum = 0;
                    try {
                        const df = el.getAttribute('data-field');
                        if (df) {
                            const parsed = JSON.parse(df);
                            author = parsed.author?.user_name || '';
                            pid = parsed.content?.post_id || '';
                            commentNum = parseInt(parsed.content?.comment_num) || 0;
                        }
                    } catch {}
                    if (!author) author = el.querySelector('.p_author_name, .d_name a')?.textContent?.trim() || '';
                    const contentEl = el.querySelector('.d_post_content, .j_d_post_content, .p_content');
                    if (contentEl) {
                        contentEl.querySelectorAll('.lzl_panel_container, .core_reply_wrapper, [class*="fold"], [class*="blocked"]').forEach(n => n.remove());
                    }
                    let content = this._processContent(contentEl);
                    content = content.replace(/该楼层疑似违规已被系统折叠/g, '')
                        .replace(/隐藏此楼/g, '').replace(/查看此楼/g, '')
                        .replace(/^\s+/, '');
                    if (commentNum > 0 && pid && tid) {
                        content += ` <span class="tb__lzl-toggle" data-pid="${pid}" data-tid="${tid}" data-count="${commentNum}">▶ 展开回复(${commentNum})</span>`;
                    }
                    const tail = el.querySelector('.post-tail-wrap span, .p_tail, .acore_reply_tail')?.textContent?.trim() || '';
                    rows.push([`${i + 1}楼`, author, content, tail]);
                });
            }

            if (pageType === 'home' || rows.length === 0) {
                rows.length = 0;
                ctx.$$('.j_feed_li, li.j_feed_li').forEach((el, i) => {
                    const barName = el.querySelector('.n_name, .feed-forum-link, a[href*="/f?kw="]')?.textContent?.trim() || '';
                    const allLinks = Array.from(el.querySelectorAll('a'));
                    const titleLink = allLinks.find(a => a.href && /\/p\/\d+/.test(a.href));
                    const title = titleLink?.textContent?.trim() || '';
                    const href = titleLink?.href || '';

                    let abs = '';
                    const absEl = el.querySelector('.n_txt, .feed_tle, .n_feed_abs');
                    if (absEl) {
                        abs = this._processContent(absEl);
                    }
                    if (!abs) {
                        const fallbackEl = el.querySelector('.n_feed_content, .feed_content, .j_feed_content');
                        if (fallbackEl) abs = this._processContent(fallbackEl);
                    }

                    const feedImgs = el.querySelectorAll('img');
                    let imgHtml = '';
                    feedImgs.forEach(img => {
                        const src = img.getAttribute('data-original') || img.getAttribute('original') || img.getAttribute('data-tb-lazyload') || img.src || '';
                        if (!src || src.includes('data:image')) return;
                        const lcSrc = src.toLowerCase();
                        const isDecor = lcSrc.includes('tb_icon') || lcSrc.includes('tieba_default')
                            || lcSrc.includes('f_header_') || lcSrc.includes('portrait')
                            || lcSrc.includes('face/item') || lcSrc.includes('/sys/')
                            || lcSrc.includes('icon') || lcSrc.includes('logo')
                            || lcSrc.includes('emoji') || lcSrc.includes('static/img');
                        if (isDecor) return;
                        const w = img.getAttribute('width');
                        if (w && parseInt(w) < 10) return;
                        imgHtml += `<span class="tb__img-tag">[图片]</span><img class="tb__excel-img" src="${this._escapeAttr(src)}"> `;
                    });

                    if (!abs && !imgHtml) {
                        const allText = el.textContent || '';
                        const cleaned = allText.replace(barName, '').replace(title, '').trim();
                        abs = this._escapeHtml(cleaned.slice(0, 80));
                    }

                    const authorLink = allLinks.find(a => a.href && /\/home\/main/.test(a.href));
                    const author = authorLink?.textContent?.trim() || '';
                    const timeEl = el.querySelector('.n_time, .feed_time, time');
                    const time = timeEl?.textContent?.trim() || '';
                    if (title || barName) {
                        const titleCell = (title && href)
                            ? `<a href="${href}">${this._escapeHtml(title)}</a>`
                            : (title ? this._escapeHtml(title) : '-');
                        rows.push([
                            `${i + 1}`,
                            barName,
                            titleCell,
                            (abs + ' ' + imgHtml).trim() || '-',
                            author,
                            time
                        ]);
                    }
                });
            }

            if (rows.length === 0) {
                const allLinks = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/f?kw="]'));
                const seen = new Set();
                allLinks.forEach((a, i) => {
                    const text = a.textContent?.trim();
                    const href = a.href;
                    if (!text || text.length < 2 || text.length > 200 || seen.has(href)) return;
                    seen.add(href);
                    const isThread = /\/p\/\d+/.test(href);
                    const isForum = /\/f\?kw=/.test(href);
                    if (isThread || isForum) {
                        rows.push([
                            `${rows.length + 1}`,
                            isForum ? '贴吧' : '帖子',
                            `<a href="${href}">${text}</a>`,
                            '', '', ''
                        ]);
                    }
                });
            }
            return rows;
        }
    });

    // =============================================
    //  模块17: ImgEnhance 图片增强
    // =============================================
    script.addModule({
        name: 'ImgEnhance',
        title: '图片增强',
        setting: { key: 'imgEnhance', title: '图片查看器', desc: '点击图片全屏查看，支持缩放/旋转/切换', default: true, group: '增强功能' },
        _images: [],
        _current: 0,
        _scale: 1,
        _rotation: 0,
        _tx: 0,
        _ty: 0,
        _dragging: false,
        _didDrag: false,
        style: `
            #tb__img_viewer{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:100002;display:none;justify-content:center;align-items:center;cursor:default}
            #tb__img_viewer.active{display:flex}
            #tb__img_viewer img#tb__viewer_img{max-width:90vw;max-height:85vh;object-fit:contain;user-select:none;-webkit-user-drag:none;cursor:grab}
            #tb__img_viewer img#tb__viewer_img.tb__dragging{cursor:grabbing;transition:none!important}
            #tb__img_viewer img#tb__viewer_img:not(.tb__dragging){transition:transform .15s}
            .tb__viewer-controls{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:100003}
            .tb__viewer-btn{background:rgba(255,255,255,.15);color:#fff;border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);transition:background .2s}
            .tb__viewer-btn:hover{background:rgba(255,255,255,.3)}
            .tb__viewer-counter{position:fixed;top:24px;left:50%;transform:translateX(-50%);color:#fff;font-size:14px;z-index:100003;background:rgba(0,0,0,.5);padding:4px 16px;border-radius:20px}
        `,
        initFunc(ctx) {
            if (!ctx.setting.normal.imgEnhance) return;
            const self = this;

            const viewer = document.createElement('div');
            viewer.id = 'tb__img_viewer';
            viewer.innerHTML = `
                <img id="tb__viewer_img" src="" alt="">
                <div class="tb__viewer-counter" id="tb__viewer_counter"></div>
                <div class="tb__viewer-controls">
                    <button class="tb__viewer-btn" id="tb__v_prev">◀</button>
                    <button class="tb__viewer-btn" id="tb__v_zoomout">−</button>
                    <button class="tb__viewer-btn" id="tb__v_reset">⊙</button>
                    <button class="tb__viewer-btn" id="tb__v_zoomin">+</button>
                    <button class="tb__viewer-btn" id="tb__v_rotate">↻</button>
                    <button class="tb__viewer-btn" id="tb__v_next">▶</button>
                </div>`;
            document.body.appendChild(viewer);

            const img = viewer.querySelector('#tb__viewer_img');
            const counter = viewer.querySelector('#tb__viewer_counter');

            const show = (index) => {
                if (index < 0 || index >= self._images.length) return;
                self._current = index;
                self._scale = 1;
                self._rotation = 0;
                self._tx = 0;
                self._ty = 0;
                self._dragging = false;
                self._didDrag = false;
                img.classList.remove('tb__dragging');
                img.src = self._images[index];
                img.style.transform = '';
                counter.textContent = `${index + 1} / ${self._images.length}`;
                viewer.style.removeProperty('display');
                viewer.classList.add('active');
            };

            const updateTransform = () => {
                img.style.transform = `translate(${self._tx}px, ${self._ty}px) scale(${self._scale}) rotate(${self._rotation}deg)`;
            };

            viewer.addEventListener('click', e => {
                if (self._didDrag) { self._didDrag = false; return; }
                if (e.target === viewer || e.target === img) { viewer.classList.remove('active'); }
            });

            let dragStartX = 0, dragStartY = 0, startTx = 0, startTy = 0;

            img.addEventListener('mousedown', e => {
                if (e.button !== 0) return;
                e.preventDefault();
                self._dragging = true;
                self._didDrag = false;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                startTx = self._tx;
                startTy = self._ty;
                img.classList.add('tb__dragging');
            });

            document.addEventListener('mousemove', e => {
                if (!self._dragging) return;
                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) self._didDrag = true;
                self._tx = startTx + dx;
                self._ty = startTy + dy;
                updateTransform();
            });

            document.addEventListener('mouseup', () => {
                if (!self._dragging) return;
                self._dragging = false;
                img.classList.remove('tb__dragging');
            });

            viewer.querySelector('#tb__v_prev').addEventListener('click', e => { e.stopPropagation(); show(self._current - 1); });
            viewer.querySelector('#tb__v_next').addEventListener('click', e => { e.stopPropagation(); show(self._current + 1); });
            viewer.querySelector('#tb__v_zoomin').addEventListener('click', e => { e.stopPropagation(); self._scale = Math.min(5, self._scale + 0.25); updateTransform(); });
            viewer.querySelector('#tb__v_zoomout').addEventListener('click', e => { e.stopPropagation(); self._scale = Math.max(0.25, self._scale - 0.25); updateTransform(); });
            viewer.querySelector('#tb__v_reset').addEventListener('click', e => {
                e.stopPropagation();
                self._scale = 1; self._rotation = 0; self._tx = 0; self._ty = 0;
                updateTransform();
            });
            viewer.querySelector('#tb__v_rotate').addEventListener('click', e => { e.stopPropagation(); self._rotation += 90; updateTransform(); });

            viewer.addEventListener('wheel', e => {
                e.preventDefault();
                const oldScale = self._scale;
                self._scale = Math.max(0.25, Math.min(5, self._scale + (e.deltaY > 0 ? -0.15 : 0.15)));
                if (self._scale <= 1 && oldScale > 1) { self._tx = 0; self._ty = 0; }
                updateTransform();
            }, { passive: false });

            document.addEventListener('keydown', e => {
                if (!viewer.classList.contains('active')) return;
                if (e.key === 'ArrowLeft') show(self._current - 1);
                else if (e.key === 'ArrowRight') show(self._current + 1);
                else if (e.key === 'Escape') viewer.classList.remove('active');
            });

            document.addEventListener('click', e => {
                const target = e.target;
                if (target.tagName !== 'IMG') return;
                const isBDE = target.classList.contains('BDE_Image') || target.matches('.d_post_content img[pic_type]');
                const isExcel = target.classList.contains('tb__excel-img');
                if (!isBDE && !isExcel) return;

                e.preventDefault();
                e.stopPropagation();
                self._images = [];

                if (isExcel) {
                    const table = target.closest('.tb__excel-table');
                    if (table) {
                        table.querySelectorAll('.tb__excel-img').forEach(i => {
                            const src = i.src;
                            if (src && !self._images.includes(src)) self._images.push(src);
                        });
                    }
                } else {
                    const container = target.closest('.d_post_content, .j_d_post_content, #j_p_postlist');
                    if (container) {
                        container.querySelectorAll('.BDE_Image, img[pic_type="0"]').forEach(i => {
                            const src = i.getAttribute('origin-src') || i.getAttribute('data-original') || i.src;
                            if (src && !self._images.includes(src)) self._images.push(src);
                        });
                    }
                }

                if (self._images.length === 0) self._images.push(target.src);
                const clickSrc = target.getAttribute('origin-src') || target.getAttribute('data-original') || target.src;
                const idx = self._images.indexOf(clickSrc);
                show(idx >= 0 ? idx : 0);
            });
        }
    });

    // =============================================
    //  模块18: AuthorMark 标记楼主
    // =============================================
    script.addModule({
        name: 'AuthorMark',
        title: '标记楼主',
        setting: { key: 'authorMark', title: '标记楼主', desc: '在帖子详情页高亮楼主发言', default: true, group: '增强功能' },
        style: `
            .tb__author-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;margin-left:4px;background:#fff7e6;color:#d48806;border:1px solid #ffe58f;font-weight:bold}
            .tb__is-author{border-left:3px solid #faad14!important}
        `,
        _authorName: '',
        renderFormsFunc(el, ctx) {
            if (!ctx.setting.normal.authorMark || !ctx.isForms()) return;

            if (!this._authorName) {
                const firstPost = ctx.$('.l_post.j_l_post');
                if (firstPost) {
                    this._authorName = (firstPost.querySelector('.p_author_name, .d_name a')?.textContent || '').trim();
                }
            }
            if (!this._authorName) return;

            const authorEl = el.querySelector('.p_author_name, .d_name a');
            if (!authorEl) return;
            const name = authorEl.textContent.trim();

            if (name === this._authorName) {
                if (!el.querySelector('.tb__author-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'tb__author-badge';
                    badge.textContent = '楼主';
                    authorEl.parentElement.appendChild(badge);
                }
                el.classList.add('tb__is-author');
            }
        }
    });

    // =============================================
    //  模块19: AutoPage 自动翻页
    // =============================================
    script.addModule({
        name: 'AutoPage',
        title: '自动翻页',
        setting: { key: 'autoPage', title: '自动翻页', desc: '滚动到页面底部时自动加载下一页内容', default: false, group: '增强功能' },
        _loading: false,
        _finished: false,
        _nextUrl: null,
        initFunc(ctx) {
            if (!ctx.setting.normal.autoPage) return;
            const self = this;

            self._findNextUrl();

            const observer = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting && !self._loading && !self._finished) {
                    self._loadNext(ctx);
                }
            }, { rootMargin: '300px' });

            const sentinel = document.createElement('div');
            sentinel.id = 'tb__autopage_sentinel';
            sentinel.style.height = '1px';

            const pager = document.querySelector('.pb_list_pager, #frs_list_pager, .l_pager');
            if (pager) {
                pager.parentElement.insertBefore(sentinel, pager.nextSibling);
                observer.observe(sentinel);
            }
        },
        _findNextUrl() {
            const nextLink = document.querySelector('.pb_list_pager a.next, #frs_list_pager a.next, .l_pager .pager_theme_5:last-child');
            if (nextLink) {
                this._nextUrl = nextLink.href;
            } else {
                this._finished = true;
            }
        },
        async _loadNext(ctx) {
            if (!this._nextUrl) { this._finished = true; return; }
            this._loading = true;
            ctx.popNotification('加载下一页...');

            try {
                const resp = await fetch(this._nextUrl, { credentials: 'include' });
                const html = await resp.text();
                const uncommented = html.replace(/<!--/g, '').replace(/-->/g, '');
                const parser = new DOMParser();
                const doc = parser.parseFromString(uncommented, 'text/html');

                if (ctx.isThreads()) {
                    const newThreads = doc.querySelectorAll('.j_thread_list');
                    const container = document.querySelector('#thread_list');
                    if (container && newThreads.length) {
                        newThreads.forEach(t => container.appendChild(document.importNode(t, true)));
                    }
                } else if (ctx.isForms()) {
                    const newPosts = doc.querySelectorAll('.l_post.j_l_post');
                    const container = document.querySelector('#j_p_postlist');
                    if (container && newPosts.length) {
                        newPosts.forEach(p => container.appendChild(document.importNode(p, true)));
                    }
                }

                const nextLink = doc.querySelector('.pb_list_pager a.next, #frs_list_pager a.next');
                if (nextLink) {
                    this._nextUrl = new URL(nextLink.getAttribute('href'), location.origin).href;
                } else {
                    this._finished = true;
                }
            } catch (e) {
                console.error('AutoPage load failed:', e);
                ctx.popNotification('加载失败', 2000);
            }
            this._loading = false;
        }
    });

    // =============================================
    //  模块20: LinkTargetBlank 新标签打开
    // =============================================
    script.addModule({
        name: 'LinkTargetBlank',
        title: '新标签打开',
        setting: { key: 'linkTargetBlank', title: '新标签打开链接', desc: '帖子链接在新标签页中打开', default: true, group: '增强功能' },
        renderThreadsFunc(el, ctx) {
            if (!ctx.setting.normal.linkTargetBlank) return;
            el.querySelectorAll('.threadlist_title a, .j_th_tit').forEach(a => {
                a.setAttribute('target', '_blank');
            });
        }
    });

    // =============================================
    //  全局基础样式
    // =============================================
    script.addModule({
        name: 'BaseStyle',
        title: '基础样式',
        style: `
            ::-webkit-scrollbar{width:8px;height:8px}
            ::-webkit-scrollbar-track{background:transparent}
            ::-webkit-scrollbar-thumb{background:#c1c1c1;border-radius:4px}
            ::-webkit-scrollbar-thumb:hover{background:#a1a1a1}
            body.tb__dark-mode ::-webkit-scrollbar-thumb{background:#484f58}
            body.tb__dark-mode ::-webkit-scrollbar-track{background:#0d1117}
        `
    });

    // =============================================
    //  LazyLoad 修复模块
    // =============================================
    script.addModule({
        name: 'LazyLoadFix',
        title: '懒加载修复',
        renderAlwaysFunc(ctx) {
            ctx.$$('img[data-tb-lazyload]').forEach(img => {
                if (!img.src || img.src.includes('data:image')) {
                    img.src = img.getAttribute('data-tb-lazyload');
                }
            });
            ctx.$$('img[original]').forEach(img => {
                if (!img.src || img.src.includes('data:image')) {
                    img.src = img.getAttribute('original');
                }
            });
        }
    });

    // =============================================
    //  初始化和渲染循环
    // =============================================
    script.init();

    const render = () => {
        script.renderAlways();
        if (script.isThreads()) script.renderThreads();
        if (script.isForms()) script.renderForms();
    };

    render();

    const observer = new MutationObserver(() => {
        requestAnimationFrame(render);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(render, 3000);

})();
