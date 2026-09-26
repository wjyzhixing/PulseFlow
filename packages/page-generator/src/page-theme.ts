/** Shared between the Studio preview and the exported Vue page. */
export const PAGE_THEME_CSS = String.raw`
.pulseflow-page{--pf-primary:#1677ff;--pf-text:#1f1f1f;--pf-text-secondary:#595959;--pf-text-tertiary:#8c8c8c;--pf-border:#f0f0f0;--pf-surface:#fff;box-sizing:border-box;width:min(1200px,100%);min-height:100vh;margin:0 auto;padding:32px;display:grid;align-content:start;gap:24px;color:var(--pf-text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;font-size:14px;line-height:1.5715;background:#fff}
.pulseflow-page *{box-sizing:border-box}
.pulseflow-page--website{width:min(1280px,100%);max-width:1280px;padding:0 40px 64px;gap:40px;background:#fff}
.pulseflow-page--admin{width:100%;max-width:1440px;padding:32px 40px 56px;gap:24px;background:#f0f2f5}
.pf-site-nav{position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:72px;padding:12px 0;background:#fff;border-bottom:1px solid var(--pf-border)}
.pf-site-nav__brand{display:inline-flex;align-items:center;gap:10px;color:#141414;text-decoration:none;font-size:18px;font-weight:650;letter-spacing:-.02em}
.pf-site-nav__brand:before{width:10px;height:10px;border-radius:3px;background:var(--pf-primary);content:""}
.pf-site-nav__links{display:flex;align-items:center;gap:32px;flex-wrap:wrap}
.pf-site-nav__links a{color:var(--pf-text-secondary);text-decoration:none;font-size:14px;transition:color .18s ease}
.pf-site-nav__links a:hover{color:var(--pf-primary)}
.pf-hero{position:relative;overflow:hidden;display:flex;min-height:360px;flex-direction:column;justify-content:center;padding:64px 72px;background:radial-gradient(ellipse at 92% 18%,rgba(22,119,255,.12),transparent 34%),linear-gradient(115deg,#f5f9ff 0%,#fff 70%);border:1px solid #e6f4ff;border-radius:12px}
.pf-image{display:block;width:100%;max-width:100%;height:auto}
.pf-hero:after{position:absolute;right:8%;bottom:-112px;width:280px;height:280px;border:1px solid rgba(22,119,255,.12);border-radius:50%;box-shadow:0 0 0 36px rgba(22,119,255,.025),0 0 0 72px rgba(22,119,255,.02);content:"";pointer-events:none}
.pf-hero__eyebrow{position:relative;z-index:1;margin:0 0 14px;color:#0958d9;font-size:13px;font-weight:600;letter-spacing:.06em}
.pf-hero h1{position:relative;z-index:1;max-width:760px;margin:0;color:#141414;font-size:clamp(34px,4.5vw,52px);line-height:1.18;font-weight:650;letter-spacing:-.035em}
.pf-hero__subtitle{position:relative;z-index:1;max-width:620px;margin:18px 0 0;color:#595959;font-size:16px;line-height:1.8}
.pf-hero--image-background .pf-hero__eyebrow{color:#91caff}
.pf-hero--image-background h1{color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.36)}
.pf-hero--image-background .pf-hero__subtitle{color:rgba(255,255,255,.88);text-shadow:0 1px 10px rgba(0,0,0,.28)}
.pf-hero__actions{position:relative;z-index:1;display:flex;gap:12px;margin-top:30px;flex-wrap:wrap}
.pf-button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 18px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#262626;text-decoration:none;font-size:14px;font-weight:500;transition:all .18s ease}
.pf-button:hover{border-color:#4096ff;color:var(--pf-primary)}
.pf-button--primary{border-color:var(--pf-primary);background:var(--pf-primary);color:#fff;box-shadow:0 2px 0 rgba(5,145,255,.1)}
.pf-button--primary:hover{border-color:#4096ff;background:#4096ff;color:#fff}
.pf-section{padding:32px;background:#fff;border:1px solid var(--pf-border);border-radius:10px}
.pf-section--muted{background:#fafafa}
.pf-section--brand{background:#f5f9ff;border-color:#d6e4ff}
.pf-section__heading{margin-bottom:24px}
.pf-section__heading h2{margin:0;color:#141414;font-size:24px;line-height:1.4;font-weight:600;letter-spacing:-.02em}
.pf-section__heading p{margin:8px 0 0;color:var(--pf-text-tertiary);line-height:1.7}
.pf-section__content{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px}
.pf-feature-card,.pf-metric-card{min-width:0;padding:22px;background:var(--pf-surface);border:1px solid var(--pf-border);border-radius:8px;transition:border-color .18s ease,box-shadow .18s ease}
.pf-feature-card:hover{border-color:#d6e4ff;box-shadow:0 4px 14px rgba(5,145,255,.08)}
.pf-feature-card__icon{display:grid;place-items:center;width:40px;height:40px;margin-bottom:18px;border-radius:9px;background:#e6f4ff;color:var(--pf-primary);font-size:19px}
.pf-feature-card h3{margin:0;color:#1f1f1f;font-size:16px;font-weight:600}
.pf-feature-card p{margin:8px 0 0;color:var(--pf-text-secondary);line-height:1.7}
.pf-metric-card__label,.pf-metric-card__trend{margin:0;color:var(--pf-text-tertiary);font-size:13px}
.pf-metric-card__value{margin:10px 0;font-size:30px;line-height:1.2;font-weight:600;color:#262626;font-variant-numeric:tabular-nums}
.pf-metric-card--success .pf-metric-card__value,.pf-metric-card--success .pf-metric-card__trend{color:#389e0d}
.pf-metric-card--warning .pf-metric-card__value,.pf-metric-card--warning .pf-metric-card__trend{color:#d48806}
.pf-cta{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:32px 40px;border:1px solid #0958d9;border-radius:12px;background:linear-gradient(120deg,#0958d9 0%,#1677ff 72%,#4096ff 100%);color:#fff}
.pf-cta:after{position:absolute;right:10%;top:-110px;width:240px;height:240px;border:1px solid rgba(255,255,255,.18);border-radius:50%;box-shadow:0 0 0 32px rgba(255,255,255,.06),0 0 0 64px rgba(255,255,255,.04);content:"";pointer-events:none}
.pf-cta__copy,.pf-cta__action{position:relative;z-index:1}
.pf-cta__copy h2{margin:0;color:#fff;font-size:22px;line-height:1.4;font-weight:600}
.pf-cta__copy p{max-width:620px;margin:8px 0 0;color:rgba(255,255,255,.82);line-height:1.7}
.pf-cta__action{display:inline-flex;flex:none;align-items:center;justify-content:center;min-height:40px;padding:0 18px;border:1px solid rgba(255,255,255,.72);border-radius:6px;background:#fff;color:#0958d9;text-decoration:none;font-weight:600;transition:background .18s ease,border-color .18s ease}
.pf-cta__action:hover{border-color:#e6f4ff;background:#e6f4ff;color:#003eb3}
.pulseflow-page .ant-card{border-color:var(--pf-border);border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.pulseflow-page .ant-card-head{min-height:48px;border-bottom-color:var(--pf-border)}
.pulseflow-page .ant-card-body{padding:20px}
.pulseflow-page .ant-table-wrapper{min-width:0;overflow-x:auto;background:#fff;border-radius:8px}
.pulseflow-page .ant-table{border-radius:8px}
.pulseflow-page .ant-table-thead>tr>th{background:#fafafa;color:#595959;font-weight:600}
.pulseflow-page .ant-table-tbody>tr:hover>td{background:#e6f4ff}
.pulseflow-page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:0 0 20px;border-bottom:1px solid #e5e6eb}
.pulseflow-page-header h1{margin:0;color:#1f1f1f;font-size:26px;line-height:1.3;font-weight:600;letter-spacing:-.02em}
.pulseflow-page-header p{margin:8px 0 0;color:#8c8c8c}
.pulseflow-page-header__tags{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pulseflow-page--admin .pulseflow-page-header{padding:0 0 20px}
.pulseflow-page--admin .pf-metric-card{padding:20px 22px;border-color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.025)}
.pulseflow-page--admin .pf-metric-card__value{font-size:28px}
.pulseflow-page--admin .ant-form{padding:20px 20px 4px;background:#fff;border:1px solid var(--pf-border);border-radius:8px}
.pulseflow-page--admin .ant-form-item-label>label{color:#595959}
@media(max-width:768px){.pulseflow-page{padding:24px 20px 40px;gap:20px}.pulseflow-page--website{padding:0 20px 40px;gap:28px}.pulseflow-page--admin{padding:24px 20px 40px}.pf-hero{min-height:320px;padding:48px 36px}.pf-section{padding:24px}}
@media(max-width:640px){.pulseflow-page{padding:16px 12px 32px;gap:16px}.pulseflow-page--website{padding:0 16px 32px;gap:20px}.pulseflow-page--admin{padding:20px 16px 32px;gap:16px}.pulseflow-page--admin .ant-row{row-gap:12px}.pulseflow-page--admin .ant-row>.ant-col{flex:0 0 100%;max-width:100%}.pf-site-nav{align-items:flex-start;flex-direction:column;gap:14px;min-height:auto;padding:18px 0}.pf-site-nav__links{gap:14px 20px}.pf-hero{min-height:280px;padding:34px 22px}.pf-hero h1{font-size:34px}.pf-hero__subtitle{font-size:15px}.pf-section{padding:20px}.pf-section__heading h2{font-size:21px}.pf-metric-card{padding:16px}.pf-cta{align-items:flex-start;flex-direction:column;padding:26px 22px}.pf-cta__copy h2{font-size:20px}.pulseflow-page-header{flex-direction:column}.pulseflow-page .ant-card-body{padding:16px}}
`;
