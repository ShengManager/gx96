export type Lang = "en" | "zh";

const translations: Record<Lang, Record<string, string>> = {
  en: {
    // Auth
    "auth.login": "Login",
    "auth.register": "Register",
    "auth.logout": "Logout",
    "auth.welcome": "Welcome to TgGaming!",

    // Navigation
    "nav.home": "Home",
    "nav.games": "Games",
    "nav.bonus": "Bonus",
    "nav.deposit": "Deposit",
    "nav.withdraw": "Withdraw",
    "nav.history": "History",
    "nav.profile": "Profile",
    "nav.setting": "Setting",
    "nav.share": "Share",
    "nav.contact": "Contact",

    // Deposit
    "deposit.title": "Deposit",
    "deposit.amount": "Amount",
    "deposit.bank": "Select Bank",
    "deposit.receipt": "Upload Receipt",
    "deposit.submit": "Submit Deposit",
    "deposit.pending": "Pending",
    "deposit.processing": "Processing",
    "deposit.approved": "Approved",
    "deposit.rejected": "Rejected",
    "deposit.cancelled": "Cancelled",
    "deposit.cycle_active": "You have an active deposit cycle. Please complete it first.",

    // Withdraw
    "withdraw.title": "Withdraw",
    "withdraw.amount": "Amount",
    "withdraw.submit": "Submit Withdrawal",
    "withdraw.rollover_not_met": "Rollover requirement not met",
    "withdraw.turnover_not_met": "Turnover requirement not met",

    // Bonus
    "bonus.title": "Bonus",
    "bonus.claim": "Claim",
    "bonus.claimed": "Claimed",
    "bonus.expired": "Expired",
    "bonus.progress": "Progress",
    "bonus.rollover": "Rollover",
    "bonus.turnover": "Turnover",

    // Games
    "game.play": "Play Now",
    "game.lobby": "Game Lobby",

    // Telegram
    "tg.welcome": "Welcome! Please register to start playing.",
    "tg.register": "Register",
    "tg.register_success": "Registration successful! Welcome aboard!",
    "tg.phone_required": "Please share your phone number to register.",
    "tg.country_not_allowed": "Sorry, your country is not supported.",
    "tg.invite_code": "Your invite code: {code}",
    "tg.share_message": "Join me on TgGaming! Use my invite code: {code}",

    // Admin
    "admin.dashboard": "Dashboard",
    "admin.players": "Players",
    "admin.deposits": "Deposits",
    "admin.withdrawals": "Withdrawals",
    "admin.bonuses": "Bonuses",
    "admin.banks": "Banks",
    "admin.reports": "Reports",
    "admin.settings": "Settings",
    "admin.telegram": "Telegram Bots",
    "admin.subaccounts": "Sub-Accounts",
    "admin.logs": "Operation Logs",
    "admin.banners": "Banners",

    // Common
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.create": "Create",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.loading": "Loading...",
    "common.no_data": "No data available",
    "common.confirm": "Confirm",
    "common.success": "Success",
    "common.error": "Error",
    "common.coming_soon": "Feature coming soon",
  },
  zh: {
    // Auth
    "auth.login": "登录",
    "auth.register": "注册",
    "auth.logout": "退出",
    "auth.welcome": "欢迎来到 TgGaming！",

    // Navigation
    "nav.home": "首页",
    "nav.games": "游戏",
    "nav.bonus": "奖励",
    "nav.deposit": "存款",
    "nav.withdraw": "提款",
    "nav.history": "记录",
    "nav.profile": "个人资料",
    "nav.setting": "设置",
    "nav.share": "分享",
    "nav.contact": "联系我们",

    // Deposit
    "deposit.title": "存款",
    "deposit.amount": "金额",
    "deposit.bank": "选择银行",
    "deposit.receipt": "上传收据",
    "deposit.submit": "提交存款",
    "deposit.pending": "待处理",
    "deposit.processing": "处理中",
    "deposit.approved": "已批准",
    "deposit.rejected": "已拒绝",
    "deposit.cancelled": "已取消",
    "deposit.cycle_active": "您有一个活跃的存款周期，请先完成。",

    // Withdraw
    "withdraw.title": "提款",
    "withdraw.amount": "金额",
    "withdraw.submit": "提交提款",
    "withdraw.rollover_not_met": "流水要求未达标",
    "withdraw.turnover_not_met": "投注额要求未达标",

    // Bonus
    "bonus.title": "奖励",
    "bonus.claim": "领取",
    "bonus.claimed": "已领取",
    "bonus.expired": "已过期",
    "bonus.progress": "进度",
    "bonus.rollover": "流水",
    "bonus.turnover": "投注额",

    // Games
    "game.play": "立即游戏",
    "game.lobby": "游戏大厅",

    // Telegram
    "tg.welcome": "欢迎！请注册以开始游戏。",
    "tg.register": "注册",
    "tg.register_success": "注册成功！欢迎加入！",
    "tg.phone_required": "请分享您的手机号码以完成注册。",
    "tg.country_not_allowed": "抱歉，您的国家暂不支持。",
    "tg.invite_code": "您的邀请码：{code}",
    "tg.share_message": "加入 TgGaming！使用我的邀请码：{code}",

    // Admin
    "admin.dashboard": "仪表盘",
    "admin.players": "玩家管理",
    "admin.deposits": "存款管理",
    "admin.withdrawals": "提款管理",
    "admin.bonuses": "奖励管理",
    "admin.banks": "银行管理",
    "admin.reports": "报表",
    "admin.settings": "系统设置",
    "admin.telegram": "Telegram 机器人",
    "admin.subaccounts": "子账号管理",
    "admin.logs": "操作日志",
    "admin.banners": "横幅管理",

    // Common
    "common.save": "保存",
    "common.cancel": "取消",
    "common.delete": "删除",
    "common.edit": "编辑",
    "common.create": "创建",
    "common.search": "搜索",
    "common.filter": "筛选",
    "common.loading": "加载中...",
    "common.no_data": "暂无数据",
    "common.confirm": "确认",
    "common.success": "成功",
    "common.error": "错误",
    "common.coming_soon": "功能即将推出",
  },
};

export function t(key: string, lang: Lang = "en", params?: Record<string, string>): string {
  let text = translations[lang]?.[key] || translations.en[key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v);
    });
  }
  return text;
}

export function getSupportedLangs(): Lang[] {
  return ["en", "zh"];
}
