import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Bot, Settings, Building2, Gift, Image, Globe,
  Shield, Users, ArrowDownCircle, ArrowUpCircle,
  ChevronDown, ChevronRight, CheckCircle2, Circle,
  AlertTriangle, Info, ExternalLink, Copy, Gamepad2,
} from "lucide-react";
import { toast } from "sonner";

interface StepProps {
  number: number;
  title: string;
  description: string;
  icon: any;
  status?: "done" | "pending" | "warning";
  children: React.ReactNode;
}

function SetupStep({ number, title, description, icon: Icon, status = "pending", children }: StepProps) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={`border-l-4 ${status === "done" ? "border-l-green-500" : status === "warning" ? "border-l-yellow-500" : "border-l-blue-500"}`}>
      <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
            status === "done" ? "bg-green-500/20 text-green-400" : status === "warning" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"
          }`}>
            {status === "done" ? <CheckCircle2 className="w-5 h-5" /> : number}
          </div>
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon className="w-4 h-4" />
              {title}
            </CardTitle>
            <CardDescription className="text-sm mt-1">{description}</CardDescription>
          </div>
          <Badge variant={status === "done" ? "default" : "outline"} className={status === "done" ? "bg-green-600" : ""}>
            {status === "done" ? "Completed" : status === "warning" ? "Needs Attention" : "Pending"}
          </Badge>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          <Separator className="mb-4" />
          <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
        </CardContent>
      )}
    </Card>
  );
}

function CopyBlock({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded p-2 font-mono text-xs">
      <code className="flex-1 break-all">{text}</code>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => {
        navigator.clipboard.writeText(text);
        toast.success("Copied!");
      }}>
        <Copy className="w-3 h-3" />
      </Button>
    </div>
  );
}

export default function AdminSetupGuide() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Setup Guide</h1>
        <p className="text-muted-foreground mt-1">
          Follow these steps to configure your TgGaming platform. Complete each step in order for the best experience.
        </p>
      </div>

      {/* Quick Start Overview */}
      <Card className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-blue-400 mb-2">Quick Start Overview</h3>
              <p className="text-sm text-muted-foreground">
                TgGaming is a Telegram-based gaming platform that allows players to register, deposit, play games, and withdraw through a Telegram bot.
                The admin panel lets you manage all operations including players, deposits, withdrawals, bonuses, and game providers.
              </p>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-background/50 rounded p-2 text-center">
                  <Bot className="w-4 h-4 mx-auto mb-1 text-blue-400" />
                  <span>Telegram Bot</span>
                </div>
                <div className="bg-background/50 rounded p-2 text-center">
                  <Gamepad2 className="w-4 h-4 mx-auto mb-1 text-green-400" />
                  <span>Game Providers</span>
                </div>
                <div className="bg-background/50 rounded p-2 text-center">
                  <Building2 className="w-4 h-4 mx-auto mb-1 text-yellow-400" />
                  <span>Bank Accounts</span>
                </div>
                <div className="bg-background/50 rounded p-2 text-center">
                  <Gift className="w-4 h-4 mx-auto mb-1 text-pink-400" />
                  <span>Bonus System</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* Step 1: System Settings */}
        <SetupStep
          number={1}
          title="Configure System Settings"
          description="Set up your platform name, timezone, and Middlewave API connection"
          icon={Settings}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">1.1 Basic Settings</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Go to <strong>Settings &gt; System Settings</strong></li>
                <li>Set your <strong>Platform Name</strong> (displayed to players)</li>
                <li>Set your <strong>Timezone</strong> (e.g., +8 for Malaysia)</li>
                <li>Set <strong>Default Currency</strong> (MYR for Malaysia)</li>
              </ul>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">1.2 Middlewave API Token</h4>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 mb-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs">
                    The Middlewave API Token is <strong>required</strong> for game functionality. Without it, players cannot access games.
                  </p>
                </div>
              </div>
              <ul className="list-disc list-inside space-y-1">
                <li>Go to <strong>Settings &gt; System Settings</strong></li>
                <li>Enter your <strong>Middlewave API Token</strong> in the designated field</li>
                <li>Click <strong>Save</strong></li>
                <li>Click <strong>Test Middlewave Connection</strong> to verify</li>
                <li>If successful, you'll see the project name and active game providers</li>
              </ul>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">1.3 Country Configuration</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Go to <strong>Settings &gt; Country Settings</strong></li>
                <li>Add allowed phone prefixes (e.g., <code>60</code> for Malaysia)</li>
                <li>This restricts registration to specific countries</li>
              </ul>
            </div>
          </div>
        </SetupStep>

        {/* Step 2: Telegram Bot */}
        <SetupStep
          number={2}
          title="Set Up Telegram Bot"
          description="Create and configure your Telegram bot for player interaction"
          icon={Bot}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.1 Create Bot on Telegram</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Open Telegram and search for <strong>@BotFather</strong></li>
                <li>Send <code>/newbot</code> to create a new bot</li>
                <li>Follow the prompts to set a name and username</li>
                <li>Copy the <strong>API Token</strong> provided by BotFather</li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.2 Configure Bot in Admin Panel</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Go to <strong>Settings &gt; Telegram Settings</strong></li>
                <li>Click <strong>Add Bot</strong></li>
                <li>Enter a <strong>Bot Name</strong> (for your reference)</li>
                <li>Paste the <strong>Bot Token</strong> from BotFather</li>
                <li>Click <strong>Save</strong></li>
                <li>The bot should show as <strong>Active</strong> with a username</li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.3 Verify Bot is Working</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Click the <strong>Diagnose</strong> button next to your bot</li>
                <li>Check that <strong>Polling Status</strong> shows "Active"</li>
                <li>Check that <strong>Bot Username</strong> is displayed correctly</li>
                <li>Open Telegram and send <code>/start</code> to your bot</li>
                <li>You should see the welcome message with Register button</li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.4 Bot Commands (for BotFather)</h4>
              <p className="mb-2">Send these commands to @BotFather using <code>/setcommands</code>:</p>
              <CopyBlock text="start - Start the bot and show main menu" />
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">2.5 Troubleshooting</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Bot not responding:</strong> Check Diagnose panel for polling errors. Try stopping and restarting the bot.</li>
                <li><strong>409 Conflict error:</strong> Another instance of the bot is running. Make sure only one server is running the bot.</li>
                <li><strong>"Games not configured":</strong> Set up the Middlewave API Token in System Settings first.</li>
                <li><strong>Registration fails:</strong> Check Country Settings for allowed phone prefixes.</li>
              </ul>
            </div>
          </div>
        </SetupStep>

        {/* Step 3: Bank Accounts */}
        <SetupStep
          number={3}
          title="Configure Bank Accounts"
          description="Add your bank accounts for player deposits and withdrawals"
          icon={Building2}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">3.1 Add Bank Accounts</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Go to <strong>Banks</strong> in the sidebar</li>
                <li>Click <strong>Add Bank</strong></li>
                <li>Select the <strong>Country</strong> (MY for Malaysia)</li>
                <li>Enter <strong>Bank Name</strong>, <strong>Account Name</strong>, <strong>Account Number</strong></li>
                <li>Set <strong>Usage Type</strong>: Deposit, Withdraw, or Both</li>
                <li>Click <strong>Save</strong></li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">3.2 Bank Usage Types</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded p-3">
                  <strong className="text-green-400">Deposit</strong>
                  <p className="text-xs mt-1">Players will see this bank when making deposits</p>
                </div>
                <div className="bg-muted/50 rounded p-3">
                  <strong className="text-blue-400">Withdraw</strong>
                  <p className="text-xs mt-1">Used for processing player withdrawals</p>
                </div>
                <div className="bg-muted/50 rounded p-3">
                  <strong className="text-purple-400">Both</strong>
                  <p className="text-xs mt-1">Available for both deposits and withdrawals</p>
                </div>
                <div className="bg-muted/50 rounded p-3">
                  <strong className="text-gray-400">Internal</strong>
                  <p className="text-xs mt-1">Internal use only, not shown to players</p>
                </div>
              </div>
            </div>
          </div>
        </SetupStep>

        {/* Step 4: Bonuses */}
        <SetupStep
          number={4}
          title="Set Up Bonuses"
          description="Configure welcome bonuses, deposit bonuses, and promotions"
          icon={Gift}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">4.1 Create a Bonus</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Go to <strong>Bonuses</strong> in the sidebar</li>
                <li>Click <strong>Add Bonus</strong></li>
                <li>Set <strong>Bonus Name</strong> and <strong>Description</strong></li>
                <li>Choose <strong>Bonus Type</strong>: Fixed, Percentage, or Random</li>
                <li>Set <strong>Rollover Multiplier</strong> (e.g., 3x means player must wager 3x the bonus before withdrawing)</li>
                <li>Set <strong>Min/Max Deposit</strong> requirements</li>
                <li>Click <strong>Save</strong></li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">4.2 Bonus Types Explained</h4>
              <div className="space-y-2">
                <div className="bg-muted/50 rounded p-3">
                  <strong>Fixed Amount</strong>
                  <p className="text-xs mt-1">Player receives a fixed bonus amount (e.g., $10 bonus on any deposit)</p>
                </div>
                <div className="bg-muted/50 rounded p-3">
                  <strong>Percentage</strong>
                  <p className="text-xs mt-1">Bonus is a percentage of the deposit (e.g., 50% bonus on $100 deposit = $50 bonus)</p>
                </div>
                <div className="bg-muted/50 rounded p-3">
                  <strong>Random</strong>
                  <p className="text-xs mt-1">Bonus is a random amount between min and max (e.g., random $5-$20 bonus)</p>
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">4.3 Rollover Rules</h4>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
                <p className="text-xs">
                  <strong>Rollover Multiplier</strong> determines how much a player must wager before they can withdraw.
                  For example, if a player deposits $100 and receives a $50 bonus with 3x rollover,
                  they must wager ($100 + $50) x 3 = $450 before withdrawing.
                </p>
              </div>
            </div>
          </div>
        </SetupStep>

        {/* Step 5: Banners */}
        <SetupStep
          number={5}
          title="Configure Banners"
          description="Set up promotional banners for the player frontend"
          icon={Image}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">5.1 Add Banners</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Go to <strong>Banners</strong> in the sidebar</li>
                <li>Click <strong>Add Banner</strong></li>
                <li>Upload a banner image (recommended: 1200x400px)</li>
                <li>Set the <strong>Link URL</strong> if the banner should link somewhere</li>
                <li>Set the <strong>Sort Order</strong> to control display order</li>
                <li>Click <strong>Save</strong></li>
              </ol>
            </div>
          </div>
        </SetupStep>

        {/* Step 6: Operations */}
        <SetupStep
          number={6}
          title="Daily Operations Guide"
          description="How to manage deposits, withdrawals, and players on a daily basis"
          icon={ArrowDownCircle}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">6.1 Processing Deposits</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Go to <strong>Deposits</strong> in the sidebar</li>
                <li>New deposits will show as <strong>Pending</strong></li>
                <li>Verify the payment was received in your bank account</li>
                <li>Click <strong>Approve</strong> to credit the player's balance</li>
                <li>Or click <strong>Reject</strong> if payment was not received</li>
              </ol>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 mt-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs">
                    You will receive real-time notifications (bell icon) when new deposits are submitted.
                    Process them promptly to maintain player satisfaction.
                  </p>
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">6.2 Processing Withdrawals</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Go to <strong>Withdrawals</strong> in the sidebar</li>
                <li>Review the withdrawal request and check rollover status</li>
                <li>Transfer the amount to the player's bank account</li>
                <li>Click <strong>Approve</strong> after transfer is complete</li>
                <li>Or click <strong>Reject</strong> with a reason if needed</li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">6.3 Managing Players</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>View player details:</strong> Click on a player to see their profile, balance, and history</li>
                <li><strong>Adjust balance:</strong> Use the balance adjustment feature for manual corrections</li>
                <li><strong>Tags:</strong> Add tags to organize players (VIP, New, etc.)</li>
                <li><strong>Block/Unblock:</strong> Block players who violate rules</li>
              </ul>
            </div>
          </div>
        </SetupStep>

        {/* Step 7: Sub-accounts */}
        <SetupStep
          number={7}
          title="Sub-Account Management"
          description="Create sub-accounts for your team with specific permissions"
          icon={Shield}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">7.1 Create Sub-Accounts</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Go to <strong>Settings &gt; Sub-Account Settings</strong></li>
                <li>Click <strong>Add Sub-Account</strong></li>
                <li>Enter <strong>Username</strong> and <strong>Password</strong></li>
                <li>Set <strong>Permissions</strong> for each module (View, Edit, Full)</li>
                <li>Click <strong>Save</strong></li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">7.2 Permission Levels</h4>
              <div className="space-y-2">
                <div className="bg-muted/50 rounded p-3">
                  <strong>View</strong>
                  <p className="text-xs mt-1">Can only view data, cannot make changes</p>
                </div>
                <div className="bg-muted/50 rounded p-3">
                  <strong>Edit</strong>
                  <p className="text-xs mt-1">Can view and modify data</p>
                </div>
                <div className="bg-muted/50 rounded p-3">
                  <strong>Full</strong>
                  <p className="text-xs mt-1">Full access including delete and critical operations</p>
                </div>
              </div>
            </div>
          </div>
        </SetupStep>

        {/* Step 8: Frontend */}
        <SetupStep
          number={8}
          title="Player Frontend Configuration"
          description="Configure the web-based player portal"
          icon={Globe}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">8.1 Frontend Settings</h4>
              <ol className="list-decimal list-inside space-y-2">
                <li>Go to <strong>Settings &gt; Frontend Settings</strong></li>
                <li>Set your <strong>Logo URL</strong> and <strong>Platform Name</strong></li>
                <li>Configure <strong>Theme Colors</strong> if needed</li>
                <li>Set up <strong>Domain ACL</strong> to restrict which domains can access the frontend</li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-2">8.2 Player Login</h4>
              <p>Players can log in through:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li><strong>Telegram Bot:</strong> Primary method - players register and play through the bot</li>
                <li><strong>Web Portal:</strong> Players can also log in via the web frontend using their username and password</li>
                <li><strong>Auto-Login Link:</strong> The bot provides auto-login links that open the web portal directly</li>
              </ul>
            </div>
          </div>
        </SetupStep>
      </div>

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm">Q: Why is the Telegram bot not responding?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              A: Check the bot status in Settings &gt; Telegram. Use the Diagnose button to see polling status and errors.
              Common causes: invalid token, another bot instance running (409 error), or network issues.
            </p>
          </div>
          <Separator />
          <div>
            <h4 className="font-semibold text-sm">Q: Why does "Games not configured" appear?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              A: You need to set up the Middlewave API Token in System Settings. This connects your platform to the game providers.
              After setting the token, click "Test Middlewave Connection" to verify.
            </p>
          </div>
          <Separator />
          <div>
            <h4 className="font-semibold text-sm">Q: How do I add a new game provider?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              A: Game providers are managed through the Middlewave API. Contact your Middlewave provider to enable new game providers
              for your project. Once enabled, they will automatically appear in the system.
            </p>
          </div>
          <Separator />
          <div>
            <h4 className="font-semibold text-sm">Q: How does the deposit cycle work?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              A: Each deposit creates a "cycle". The player must complete the rollover requirement (based on deposit + bonus amount x multiplier)
              before they can withdraw. Once the rollover is met, the cycle is completed and the player can withdraw.
            </p>
          </div>
          <Separator />
          <div>
            <h4 className="font-semibold text-sm">Q: Can I have multiple Telegram bots?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              A: Yes, you can add multiple bots in Settings &gt; Telegram. Each bot operates independently and can serve different purposes
              (e.g., different brands or regions).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
