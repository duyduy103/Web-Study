"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Label } from "@/components/ui/label";
import type { SpreadsheetColumnMapping } from "@/lib/parsing/types";

interface ColumnMappingEditorProps {
  headers: string[];
  mapping: SpreadsheetColumnMapping;
  onChange: (nextMapping: SpreadsheetColumnMapping) => void;
}

export function ColumnMappingEditor({
  headers,
  mapping,
  onChange,
}: ColumnMappingEditorProps) {
  function handleFieldChange(
    field: keyof SpreadsheetColumnMapping,
    value: string
  ) {
    onChange({
      ...mapping,
      [field]: value || undefined,
    });
  }

  const optionalFields: Array<{
    key: keyof SpreadsheetColumnMapping;
    label: string;
  }> = [
    { key: "optionACol", label: vi.importSet.colOptionALabel },
    { key: "optionBCol", label: vi.importSet.colOptionBLabel },
    { key: "optionCCol", label: vi.importSet.colOptionCLabel },
    { key: "optionDCol", label: vi.importSet.colOptionDLabel },
    { key: "explanationCol", label: vi.importSet.colExplanationLabel },
    { key: "topicCol", label: vi.importSet.colTopicLabel },
    { key: "difficultyCol", label: vi.importSet.colDifficultyLabel },
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900">
          {vi.importSet.columnMappingTitle}
        </h3>
        <p className="text-xs text-slate-600">
          {vi.importSet.columnMappingDescription}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="map-stem">{vi.importSet.colStemLabel}</Label>
          <select
            id="map-stem"
            value={mapping.stemCol}
            onChange={(e) =>
              onChange({ ...mapping, stemCol: e.target.value })
            }
            className="flex min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:border-teal-600 focus-visible:outline-none"
          >
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="map-correct">{vi.importSet.colCorrectLabel}</Label>
          <select
            id="map-correct"
            value={mapping.correctCol}
            onChange={(e) =>
              onChange({ ...mapping, correctCol: e.target.value })
            }
            className="flex min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:border-teal-600 focus-visible:outline-none"
          >
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        {optionalFields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`map-${field.key}`}>{field.label}</Label>
            <select
              id={`map-${field.key}`}
              value={mapping[field.key] ?? ""}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              className="flex min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:border-teal-600 focus-visible:outline-none"
            >
              <option value="">{vi.importSet.colNoneOption}</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

