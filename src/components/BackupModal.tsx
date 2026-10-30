import React, { useState, useRef } from 'react';
import {
  Upload,
  Download,
  X,
  Check,
  AlertCircle,
  RotateCcw,
  FileArchive,
  Building2,
  Trash2,
} from 'lucide-react';
import { BillingDatabase } from '../data/initialDb';
import { fmt } from '../utils/formatters';
import { parseBackupFile, downloadBakFile } from '../utils/bakParser';

export interface CompanySlot {
  id: string;
  name: string;
  db: BillingDatabase;
  updatedAt: string;
}

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDb: BillingDatabase;
  companies: CompanySlot[];
  activeCompanyId: string;
  onSwitchCompany: (companyId: string) => void;
  onDeleteCompany: (companyId: string) => void;
  onRestoreDatabase: (
    newDb: BillingDatabase,
    mode: 'new_company' | 'replace' | 'merge',
    customCompanyName?: string
  ) => void;
  onResetToFactory: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  currentDb,
  companies,
  activeCompanyId,
  onSwitchCompany,
  onDeleteCompany,
  onRestoreDatabase,
  onResetToFactory,
}) => {
  // Default to 'new_company' so uploading a 2nd company's .bak immediately switches to that company
  const [importMode, setImportMode] = useState<'new_company' | 'replace' | 'merge'>('new_company');
  const [customCompanyName, setCustomCompanyName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    setStatusMsg(null);
    setIsProcessing(true);
    try {
      const extracted = await parseBackupFile(file, currentDb.co);
      if (!extracted) {
        setStatusMsg({
          type: 'error',
          text: `Could not extract billing records from "${file.name}". Please ensure it is a valid .bak database backup, SQL dump, XML, JSON, or HTML backup file.`,
        });
        setIsProcessing(false);
        return;
      }

      const finalCompanyName =
        customCompanyName.trim().toUpperCase() ||
        extracted.co?.n?.trim() ||
        file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim()
          .toUpperCase();

      const updatedExtracted: BillingDatabase = {
        ...extracted,
        co: {
          ...extracted.co,
          n: finalCompanyName,
        },
      };

      onRestoreDatabase(updatedExtracted, importMode, finalCompanyName);
      setCustomCompanyName('');
      setStatusMsg({
        type: 'success',
        text: `Loaded "${finalCompanyName}" from "${file.name}": ${fmt(
          updatedExtracted.inv.length
        )} invoices, ${fmt(updatedExtracted.cust.length)} customers, ${fmt(
          updatedExtracted.prod.length
        )} products, and ${fmt(updatedExtracted.rec.length)} receipts.`,
      });
      setTimeout(() => {
        onClose();
      }, 400);
    } catch {
      setStatusMsg({
        type: 'error',
        text: `Failed to read backup file "${file.name}".`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1e201d] text-stone-900 dark:text-[#ecebe5] p-6 shadow-xl my-8">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#0f5c4d]/10 dark:bg-[#4fb59f]/15 flex items-center justify-center text-[#0f5c4d] dark:text-[#4fb59f]">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Upload .bak Backup & Multi-Company Manager</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Upload your <code>.bak</code> backup file to load and view company billing data
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          {/* Loaded Companies Switcher */}
          <div className="p-3.5 rounded-lg bg-stone-50 dark:bg-[#151614] border border-stone-200 dark:border-stone-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#0f5c4d] dark:text-[#4fb59f]" />
                Loaded Companies ({companies.length})
              </span>
            </div>
            {companies.length === 0 ? (
              <div className="text-xs text-stone-500 py-2">
                No backup file loaded yet. Upload a <code>.bak</code> file below to display all billing data.
              </div>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {companies.map((slot, index) => {
                  const isActive = slot.id === activeCompanyId;
                  return (
                    <div
                      key={slot.id}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border transition-colors ${
                        isActive
                          ? 'border-[#0f5c4d] bg-[#0f5c4d]/10 dark:border-[#4fb59f] dark:bg-[#4fb59f]/15'
                          : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1e201d]'
                      }`}
                    >
                      <div
                        onClick={() => {
                          onSwitchCompany(slot.id);
                          onClose();
                        }}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                            Company {index + 1}: {slot.db.co.n}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0f5c4d] text-white">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                          {fmt(slot.db.inv.length)} Bills · {fmt(slot.db.cust.length)} Customers ·{' '}
                          {fmt(slot.db.prod.length)} Products · {fmt(slot.db.rec.length)} Receipts
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => {
                              onSwitchCompany(slot.id);
                              onClose();
                            }}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-[#0f5c4d] text-white hover:bg-[#0b463b] cursor-pointer"
                          >
                            Switch
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteCompany(slot.id)}
                          title="Remove this company"
                          className="p-1.5 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upload Mode Selector */}
          {companies.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                How should the uploaded <code>.bak</code> file be loaded?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('new_company')}
                  className={`p-2.5 text-left rounded-lg border text-xs cursor-pointer transition-colors ${
                    importMode === 'new_company'
                      ? 'border-[#0f5c4d] bg-[#0f5c4d]/10 dark:border-[#4fb59f] dark:bg-[#4fb59f]/15'
                      : 'border-stone-200 dark:border-stone-700'
                  }`}
                >
                  <div className="font-semibold">Load as Separate Company</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Adds company & switches to it immediately
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={`p-2.5 text-left rounded-lg border text-xs cursor-pointer transition-colors ${
                    importMode === 'replace'
                      ? 'border-[#0f5c4d] bg-[#0f5c4d]/10 dark:border-[#4fb59f] dark:bg-[#4fb59f]/15'
                      : 'border-stone-200 dark:border-stone-700'
                  }`}
                >
                  <div className="font-semibold">Replace Active Company</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Replaces {currentDb.co.n} with the uploaded .bak data
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={`p-2.5 text-left rounded-lg border text-xs cursor-pointer transition-colors ${
                    importMode === 'merge'
                      ? 'border-[#0f5c4d] bg-[#0f5c4d]/10 dark:border-[#4fb59f] dark:bg-[#4fb59f]/15'
                      : 'border-stone-200 dark:border-stone-700'
                  }`}
                >
                  <div className="font-semibold">Merge into Active</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Combines bills/receipts into {currentDb.co.n}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Optional Company Name Override */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Company Name for Uploaded Backup (Optional)
            </label>
            <input
              type="text"
              value={customCompanyName}
              onChange={(e) => setCustomCompanyName(e.target.value)}
              placeholder="Leave blank to auto-detect from .bak file"
              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151614] text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#0f5c4d]"
            />
          </div>

          {/* Drag & Drop .bak File Upload Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
              isDragging
                ? 'border-[#0f5c4d] bg-[#0f5c4d]/5 dark:border-[#4fb59f] dark:bg-[#4fb59f]/10'
                : 'border-stone-300 dark:border-stone-700'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".bak,.BAK,.json,.html,.htm,.xml,.sql,.zip,.gz,.db,.sqlite"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="w-7 h-7 text-[#0f5c4d] dark:text-[#4fb59f] mx-auto mb-2" />
            <div className="text-xs font-semibold mb-1">
              Drop your <code>.bak</code> backup file here, or click below to browse
            </div>
            <p className="text-[11px] text-stone-500 mb-3">
              Supports MS SQL Server <code>.bak</code>, SQLite <code>.bak</code>, SQL Dump, XML, JSON, or HTML backups
            </p>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0f5c4d] text-white hover:bg-[#0b463b] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              {isProcessing ? 'Extracting .bak Database...' : 'Select .bak File to Upload'}
            </button>
          </div>

          {statusMsg && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                statusMsg.type === 'success'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Download .bak & Clear All Data Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => {
                onResetToFactory();
                setStatusMsg({
                  type: 'success',
                  text: 'Cleared all loaded data.',
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear All Data
            </button>

            {companies.length > 0 && (
              <button
                type="button"
                onClick={() => downloadBakFile(currentDb)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-[#0f5c4d] dark:border-[#4fb59f] text-[#0f5c4d] dark:text-[#4fb59f] hover:bg-[#0f5c4d]/10 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download {currentDb.co.n} (.bak)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
