"use client";

import * as React from "react";
import Link from "next/link";
import { vi } from "@/lib/i18n/vi";
import { ClassMembersTab } from "@/components/features/classes/class-members-tab";
import { ClassResultsTab } from "@/components/features/classes/class-results-tab";
import {
  ClassSettingsTab,
  type ClassRecordDetail,
} from "@/components/features/classes/class-settings-tab";
import {
  ClassAssignmentsTab,
  type TeacherOwnedExamOption,
  type TeacherOwnedSetOption,
} from "@/components/features/classes/class-assignments-tab";
import type { ClassMemberItem } from "@/lib/classes/schemas";
import type { TeacherClassAssignmentItem } from "@/lib/classes/assignments";

interface ClassDetailWorkspaceProps {
  initialClass: ClassRecordDetail;
  initialMembers: ClassMemberItem[];
  initialAssignments: TeacherClassAssignmentItem[];
  ownedExams: TeacherOwnedExamOption[];
  ownedSets: TeacherOwnedSetOption[];
  maxStudentsPerClass: number;
  appOrigin: string;
}

type ActiveTab = "students" | "assignments" | "results" | "settings";

export function ClassDetailWorkspace({
  initialClass,
  initialMembers,
  initialAssignments,
  ownedExams,
  ownedSets,
  maxStudentsPerClass,
  appOrigin,
}: ClassDetailWorkspaceProps) {
  const [classData, setClassData] =
    React.useState<ClassRecordDetail>(initialClass);
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("students");

  const pendingCount = initialMembers.filter(
    (m) => m.status === "pending"
  ).length;

  const tabs: Array<{ id: ActiveTab; label: string; badge?: number }> = [
    {
      id: "students",
      label: vi.classes.tabs.students,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { id: "assignments", label: vi.classes.tabs.assignments },
    { id: "results", label: vi.classes.tabs.results },
    { id: "settings", label: vi.classes.tabs.settings },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <Link
            href="/dashboard/classes"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-teal-700 hover:underline"
          >
            {vi.classes.backToClasses}
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {classData.name}
            </h1>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-slate-800">
              {classData.join_code}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                classData.archived_at
                  ? "bg-slate-200 text-slate-700"
                  : classData.is_open
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {classData.archived_at
                ? vi.classes.statusArchivedBadge
                : classData.is_open
                  ? vi.classes.statusOpenBadge
                  : vi.classes.statusClosedBadge}
            </span>
          </div>
          {classData.description ? (
            <p className="text-sm text-slate-600">{classData.description}</p>
          ) : null}
        </div>
      </div>

      {/* Thanh tab 4 mục */}
      <div
        role="tablist"
        aria-label={classData.name}
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-2"
      >
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
                isSelected
                  ? "bg-teal-600 text-white shadow-2xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    isSelected
                      ? "bg-white text-teal-800"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Nội dung từng tab */}
      {activeTab === "students" ? (
        <ClassMembersTab
          classId={classData.id}
          initialMembers={initialMembers}
          maxStudentsPerClass={maxStudentsPerClass}
        />
      ) : null}

      {activeTab === "assignments" ? (
        <ClassAssignmentsTab
          classId={classData.id}
          initialAssignments={initialAssignments}
          ownedExams={ownedExams}
          ownedSets={ownedSets}
        />
      ) : null}

      {activeTab === "results" ? (
        <ClassResultsTab classId={classData.id} />
      ) : null}

      {activeTab === "settings" ? (
        <ClassSettingsTab
          classData={classData}
          appOrigin={appOrigin}
          onClassUpdated={(next) => setClassData(next)}
        />
      ) : null}
    </div>
  );
}

