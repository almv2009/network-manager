import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen,
  PlusCircle,
  Save,
  Calendar,
  Users,
  Shield,
  ClipboardList,
  Activity,
  Flag,
  Bell,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  UserCircle2,
  ArrowRight,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

const topTabs = [
  { id: "case-status", label: "Case Status", icon: Flag },
  { id: "timeline", label: "Timeline", icon: Calendar },
  { id: "network", label: "Network Building", icon: Users },
  { id: "planning", label: "Safeguarding Planning", icon: Shield },
  { id: "monitoring", label: "Monitoring & Testing", icon: Activity },
  { id: "closure", label: "Closure & Ongoing Safeguarding", icon: CheckCircle2 },
];

const sampleNetwork = [
  { name: "Karen", role: "Primary evening support", reliability: 90, availability: "Mon, Wed, Fri" },
  { name: "Mary", role: "Backup overnight support", reliability: 82, availability: "Daily" },
  { name: "Lisa", role: "School and neighbourhood check-in", reliability: 88, availability: "Weekdays" },
  { name: "Mrs. Patel", role: "School contact", reliability: 78, availability: "School hours" },
];

const sampleRules = [
  {
    id: "Rule 1",
    title: "Children are supervised every evening",
    owner: "Karen",
    backup: "Mary",
    status: "On track",
    note: "Evening handoff confirmed by 7:30 p.m.",
  },
  {
    id: "Rule 2",
    title: "Network is notified if caregiver becomes overwhelmed",
    owner: "Anna",
    backup: "Lisa",
    status: "Needs review",
    note: "Escalation language needs to be simplified.",
  },
  {
    id: "Rule 3",
    title: "School attendance is checked daily",
    owner: "Mrs. Patel",
    backup: "Karen",
    status: "On track",
    note: "Attendance updates entered by 9:15 a.m.",
  },
];

const monitoringChecks = [
  "Roles are being carried out as agreed",
  "Communication chain is working",
  "Early warning signs are being noticed quickly",
  "The child’s day-to-day wellbeing looks stable",
  "Backups are clear when routines change",
];

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{helper}</p>
          </div>
          <div className="rounded-2xl bg-slate-100 p-3">
            <Icon className="h-5 w-5 text-slate-700" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export default function SGTNetworkAppShell() {
  const [activeTab, setActiveTab] = useState("case-status");

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-sm"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-teal-200 bg-teal-50">
                <Shield className="h-7 w-7 text-teal-700" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                  Network Manager
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  A shared safeguarding, continuity, and self-management tool for one family, their network, and supporting professionals.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-100">
                Practitioner View
              </Badge>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                <UserCircle2 className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <Card className="rounded-[28px] border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
                <FolderOpen className="h-5 w-5 text-blue-600" /> Family Safeguarding Workspace
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Button className="h-12 rounded-2xl bg-emerald-600 text-base font-medium hover:bg-emerald-700">
                      <Save className="mr-2 h-4 w-4" /> Save Family Workspace
                    </Button>
                    <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600">
                      Workspace mode: Shared family and network access
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-slate-700">Current workspace</Label>
                    <Input
                      defaultValue="Miller Family Workspace"
                      readOnly
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50"
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-700">
                      This workspace is built for one family and its safeguarding network.
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      It supports active CPS involvement, transition planning, and long-term family and network use after formal closure.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">Continuity status</p>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-sm text-slate-600">Current phase</span>
                      <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-50">
                        CPS active
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-sm text-slate-600">Post-closure continuity</span>
                      <span className="text-sm font-medium text-slate-900">Enabled</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-sm text-slate-600">Network self-management tools</span>
                      <span className="text-sm font-medium text-slate-900">Included</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList className="h-auto w-full min-w-max justify-start rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              {topTabs.map(({ id, label, icon: Icon }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="rounded-xl px-4 py-3 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="case-status" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Current Phase" value="CPS Active" helper="Built to continue after formal closure" icon={Flag} />
              <MetricCard title="Network Members" value="7" helper="Shared access for caregivers and network members" icon={Users} />
              <MetricCard title="Plan Reliability" value="82%" helper="Based on recent monitoring and continuity entries" icon={Shield} />
              <MetricCard title="Continuity Readiness" value="76%" helper="Measures readiness for long-term family ownership" icon={Calendar} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Case Dashboard</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex justify-start">
                    <Button className="rounded-2xl bg-emerald-600 hover:bg-emerald-700">Save Case</Button>
                  </div>

                  <div>
                    <SectionTitle
                      title="Case Information"
                      description="Basic case setup used across all safeguarding modules."
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Case Name / Family Name</Label>
                        <Input defaultValue="Miller Family" className="h-11 rounded-2xl border-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <Label>Lead Practitioner</Label>
                        <Input defaultValue="Practitioner Name" className="h-11 rounded-2xl border-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <Label>Case Start Date</Label>
                        <Input defaultValue="2026-03-30" className="h-11 rounded-2xl border-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <Label>Case Status</Label>
                        <Select defaultValue="open">
                          <SelectTrigger className="h-11 rounded-2xl border-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="handover">Preparing Handover</SelectItem>
                            <SelectItem value="closed">Closed to CPS, network active</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <SectionTitle
                      title="Caregivers Information"
                      description="Primary caregiver details and key support needs."
                    />
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">
                        Anna, primary caregiver. Current priorities include evening structure, emotional support, and reliable backup coverage.
                      </p>
                      <Button variant="outline" className="rounded-2xl border-slate-200 bg-white">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Caregiver
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Priority Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                      <div>
                        <p className="font-medium text-amber-900">Current Watchpoint</p>
                        <p className="mt-1 text-sm text-amber-800">
                          Evening routines become less reliable when caregiver stress rises.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-medium text-slate-700">Plan Stability</p>
                    <div className="mt-3 space-y-2">
                      <Progress value={82} className="h-3" />
                      <p className="text-sm text-slate-500">
                        Stable overall, but communication clarity needs improvement.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700">Immediate actions</p>
                    {[
                      "Confirm backup for Thursday evening",
                      "Review escalation wording with caregiver",
                      "Schedule next fire drill",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                        <Bell className="h-4 w-4 text-blue-600" />
                        <span className="text-sm text-slate-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="space-y-6">
            <div className="grid gap-6">
              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Risk Statement</Label>
                      <Textarea
                        defaultValue="Children may experience gaps in supervision when caregiver becomes overwhelmed in the evening."
                        className="min-h-[120px] rounded-2xl border-slate-200"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Safeguarding Goals</Label>
                      <Textarea
                        defaultValue="Children are consistently supervised, emotionally settled, and supported by a reliable network that responds early when routines weaken."
                        className="min-h-[120px] rounded-2xl border-slate-200"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-5">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-900">Safeguarding Scale</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Current shared judgement of safeguarding strength and reliability.
                        </p>
                      </div>
                      <span className="text-lg font-semibold text-slate-900">7/10</span>
                    </div>

                    <div className="space-y-2">
                      <Progress value={70} className="h-3" />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>0, Unsafe and unstable</span>
                        <span>10, Strong and sustainable safeguarding</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    {
                      date: "Mar 30",
                      title: "Case opened and network companion file created",
                      helper: "Risk statement and first safeguarding goals entered.",
                    },
                    {
                      date: "Apr 01",
                      title: "Initial network meeting",
                      helper: "Roles drafted for evenings, school mornings, and backup response.",
                    },
                    {
                      date: "Apr 04",
                      title: "Formal review meeting",
                      helper: "Assess whether escalation wording is understood by all members.",
                    },
                    {
                      date: "Apr 10",
                      title: "Fire drill practice",
                      helper: "Test late-evening breakdown scenario and network response speed.",
                    },
                  ].map((item, index) => (
                    <div key={item.title} className="flex gap-4 rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col items-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                          {index + 1}
                        </div>
                        {index < 3 && <div className="mt-2 h-full w-px bg-slate-200" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500">{item.date}</p>
                        <p className="mt-1 font-medium text-slate-900">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.helper}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="network" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Network Members & Roles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sampleNetwork.map((person) => (
                    <div key={person.name} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{person.name}</p>
                          <p className="text-sm text-slate-600">{person.role}</p>
                        </div>
                        <Badge className="w-fit rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-100">
                          {person.availability}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Reliability</span>
                          <span className="font-medium text-slate-900">{person.reliability}%</span>
                        </div>
                        <Progress value={person.reliability} className="h-3" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Network Gaps & Development</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-medium text-slate-900">Current gaps</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      <li>• Weekend backup is not strong enough yet</li>
                      <li>• Escalation language needs to be simple and consistent</li>
                      <li>• One additional overnight support option is recommended</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">Next network-building steps</p>
                    <div className="mt-3 space-y-3">
                      {[
                        "Confirm whether Norma can cover Saturday evenings",
                        "Add backup contact for school-day emergencies",
                        "Review network confidence in escalation process",
                      ].map((task) => (
                        <div key={task} className="flex items-start gap-3">
                          <ArrowRight className="mt-0.5 h-4 w-4 text-blue-600" />
                          <span className="text-sm text-slate-700">{task}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="planning" className="space-y-6">
            <Card className="rounded-[28px] border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-slate-900">Safeguarding Rules and Commitments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {sampleRules.map((rule) => (
                  <div key={rule.id} className="rounded-2xl border border-slate-200 p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-50">
                            {rule.id}
                          </Badge>
                          <p className="font-medium text-slate-900">{rule.title}</p>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">{rule.note}</p>
                      </div>
                      <Badge className="w-fit rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-100">
                        {rule.status}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Primary owner</p>
                        <p className="mt-1 font-medium text-slate-900">{rule.owner}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Backup</p>
                        <p className="mt-1 font-medium text-slate-900">{rule.backup}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Check method</p>
                        <p className="mt-1 font-medium text-slate-900">Text and evening confirmation</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">If it breaks down</p>
                        <p className="mt-1 font-medium text-slate-900">Escalate to backup chain</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monitoring" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Monitoring Checklist</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {monitoringChecks.map((item, index) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-sm font-medium text-emerald-700">
                        {index + 1}
                      </div>
                      <span className="text-sm text-slate-700">{item}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Fire Drill & Testing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-medium text-slate-900">Next scenario</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Test late-evening loss of coverage and confirm whether the backup chain responds within 30 minutes.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-500">Scheduled date</p>
                      <p className="mt-1 font-medium text-slate-900">Apr 10, 2026</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-500">Participants</p>
                      <p className="mt-1 font-medium text-slate-900">Anna, Karen, Mary, Lisa</p>
                    </div>
                  </div>
                  <Button className="rounded-2xl bg-blue-600 hover:bg-blue-700">
                    <ClipboardList className="mr-2 h-4 w-4" /> Open fire drill record
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="closure" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Closure Stage and Ongoing Safeguarding</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">CPS closure stage</p>
                    <p className="mt-2 text-sm text-slate-600">
                      This stage refers only to formal closure with the CPS organization. It marks the end of statutory involvement, not the end of safeguarding work.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">Network sustainability after closure</p>
                    <p className="mt-2 text-sm text-slate-600">
                      After CPS closes, the network continues monthly reviews, refreshes roles, replaces lost capacity early, and keeps all core members clear about commitments.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">Ongoing safeguarding plan management</p>
                    <p className="mt-2 text-sm text-slate-600">
                      The app continues to support review, revision, and strengthening of the safeguarding plan after closure so the family and network can adapt the plan when circumstances change.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">Communication, mitigation, and what-if scenarios</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Contact pathways, mitigation responses, and what-if scenarios remain live after closure so the network knows how to respond when routines weaken or new risks emerge.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">Recording and ongoing safeguarding activity</p>
                    <p className="mt-2 text-sm text-slate-600">
                      After closure, the app still allows journaling, recording of events, monitoring of commitments, and ongoing safeguarding activity so the network can maintain consistency over time.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">Post-Closure Support Tools and Handover Pack</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-900">Recent entry</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Caregiver reported a difficult evening on Friday but asked for help early, which allowed the network to stabilize routines before they broke down.
                        </p>
                      </div>
                      <MessageSquare className="h-5 w-5 text-slate-500" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-medium text-slate-900">Post-closure safeguarding tools</p>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <p>• Ongoing journal and observation log</p>
                      <p>• Shared communication and response pathways</p>
                      <p>• Sustainability review prompts</p>
                      <p>• What-if and mitigation scenario guidance</p>
                      <p>• Plan editing and update support after closure</p>
                      <p>• Ongoing monitoring of roles and commitments</p>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {[
                      "CPS closure summary",
                      "Final safeguarding plan at closure",
                      "Network sustainability plan",
                      "Communication and escalation pathway",
                      "Mitigation and what-if scenario library",
                      "Monitoring summary and continuity review dates",
                    ].map((doc) => (
                      <div key={doc} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-sm text-slate-700">{doc}</span>
                      </div>
                    ))}
                  </div>
                  <Button className="rounded-2xl bg-emerald-600 hover:bg-emerald-700">
                    <Save className="mr-2 h-4 w-4" /> Generate closure and ongoing safeguarding pack
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
