"use client";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  useUploadSales, useUploadStock, useUploadHistory, useDeleteUpload,
  useFolderConfig, useSaveFolderConfig, useSyncFromFolder,
  useOsvFolderConfig, useSaveOsvFolderConfig, useScanOsvFolder, useUploadOsvFiles,
} from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  CheckCircle, XCircle, Loader2, FileSpreadsheet, Clock,
  TrendingUp, Package, ArrowRight, Trash2, FolderOpen, RefreshCw, Settings,
} from "lucide-react";
import Link from "next/link";
import type { UploadResponse } from "@/types";

interface DropZoneProps {
  type: "sales" | "stock";
  label: string;
  hint: string;
  onUpload: (file: File) => Promise<UploadResponse>;
}

function DropZone({ type, label, hint, onUpload }: DropZoneProps) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (!accepted[0]) return;
      setState("loading");
      setResult(null);
      setErrorMsg("");
      try {
        const res = await onUpload(accepted[0]);
        setResult(res);
        setState("success");
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : "Ошибка загрузки");
        setState("error");
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled: state === "loading",
  });

  const resultLink = type === "sales" ? "/dashboard/sales" : "/dashboard/stock";
  const resultLabel = type === "sales" ? "Смотреть продажи" : "Смотреть остатки";
  const ResultIcon = type === "sales" ? TrendingUp : Package;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>

      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
          isDragActive
            ? "border-blue-500 bg-blue-50"
            : state === "success"
            ? "border-green-400 bg-green-50"
            : state === "error"
            ? "border-red-300 bg-red-50"
            : "border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50"
        )}
      >
        <input {...getInputProps()} />

        {state === "loading" ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="text-blue-500 animate-spin" />
            <div className="text-sm font-medium text-gray-600">Обрабатываем файл...</div>
            <div className="text-xs text-gray-400">Парсим строки, сохраняем в базу</div>
          </div>
        ) : state === "success" && result ? (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle size={28} className="text-green-500" />
            <div className="text-sm font-bold text-green-700">Загружено успешно</div>
            <div className="flex gap-4 text-xs text-gray-600">
              <span className="bg-white border border-green-200 rounded-lg px-3 py-1.5">
                <span className="font-black text-green-700 text-base mr-1">{result.rows_processed}</span>
                строк обработано
              </span>
              <span className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 font-mono">
                {result.period_date}
              </span>
            </div>
            {result.errors?.length > 0 && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 max-w-full">
                ⚠ {result.errors[0]}
              </div>
            )}
            <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
              <Link
                href={resultLink}
                className="flex items-center gap-1.5 bg-gray-900 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <ResultIcon size={13} />
                {resultLabel}
                <ArrowRight size={12} />
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                На дашборд
              </Link>
            </div>
            <button
              className="text-xs text-gray-400 hover:text-gray-600 mt-1"
              onClick={(e) => { e.stopPropagation(); setState("idle"); }}
            >
              Загрузить другой файл
            </button>
          </div>
        ) : state === "error" ? (
          <div className="flex flex-col items-center gap-3">
            <XCircle size={28} className="text-red-500" />
            <div className="text-sm font-bold text-red-600">Ошибка загрузки</div>
            <div className="text-xs text-red-500 max-w-xs">{errorMsg}</div>
            <button
              className="mt-1 text-xs text-blue-700 hover:underline"
              onClick={(e) => { e.stopPropagation(); setState("idle"); }}
            >
              Попробовать снова
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet size={22} className="text-gray-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-700">
                {isDragActive ? "Отпустите файл" : "Перетащите файл или кликните"}
              </div>
              <div className="text-xs text-gray-400 mt-1">{hint}</div>
              <div className="text-xs text-gray-300 mt-1 font-mono">.xlsx · .xls</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SyncFromFolderBlock() {
  const { data: cfg, isLoading } = useFolderConfig();
  const saveConfig = useSaveFolderConfig();
  const sync = useSyncFromFolder();
  const [editing, setEditing] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [syncResult, setSyncResult] = useState<{ rows: number; date: string } | null>(null);

  const handleSave = async () => {
    await saveConfig.mutateAsync({ stock_folder: folderInput });
    setEditing(false);
  };

  const handleSync = async () => {
    setSyncResult(null);
    const res = await sync.mutateAsync();
    setSyncResult({ rows: res.rows_processed, date: res.period_date });
  };

  const hasFolder = !!cfg?.stock_folder;
  const latestFile = cfg?.stock_latest_file;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <FolderOpen size={14} className="text-blue-500" />
        <span className="text-sm font-bold text-gray-900">Синхронизация из папки</span>
        <span className="text-xs text-gray-400 ml-1">— один клик вместо загрузки файла</span>
        <button
          onClick={() => { setEditing(!editing); setFolderInput(cfg?.stock_folder ?? ""); }}
          className="ml-auto p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          title="Настройки папки"
        >
          <Settings size={14} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Folder path editor */}
        {editing && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Путь к папке с файлами 1С</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="C:\Users\Askhat\OneDrive\Рабочий стол\Real Trade"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSave}
                disabled={saveConfig.isPending}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-40"
              >
                {saveConfig.isPending ? <Loader2 size={14} className="animate-spin" /> : "Сохранить"}
              </button>
            </div>
            <div className="text-xs text-gray-400">
              Укажи папку куда 1С сохраняет отчёт "остатки и продажи". Файл будет подхватываться автоматически.
            </div>
          </div>
        )}

        {/* Status */}
        {!isLoading && (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              {hasFolder ? (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 font-mono truncate">{cfg.stock_folder}</div>
                  {latestFile ? (
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet size={13} className="text-green-500" />
                      <span className="text-xs text-gray-700 font-medium">{latestFile.name}</span>
                      <span className="text-xs text-gray-400">{latestFile.size_kb} КБ</span>
                    </div>
                  ) : (
                    <div className="text-xs text-amber-600">Файлы .xlsx не найдены в папке</div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  Папка не настроена — нажми <Settings size={12} className="inline" /> чтобы указать путь
                </div>
              )}
            </div>

            <button
              onClick={handleSync}
              disabled={!hasFolder || !latestFile || sync.isPending}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                hasFolder && latestFile
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
            >
              {sync.isPending
                ? <><Loader2 size={15} className="animate-spin" /> Загружаем...</>
                : <><RefreshCw size={15} /> Синхронизировать</>}
            </button>
          </div>
        )}

        {/* Result */}
        {syncResult && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle size={16} className="text-green-500" />
            <span className="text-sm text-green-800 font-medium">
              Загружено: {syncResult.rows.toLocaleString("ru")} позиций за {syncResult.date}
            </span>
          </div>
        )}
        {sync.isError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <XCircle size={16} className="text-red-500" />
            <span className="text-sm text-red-700">{(sync.error as Error).message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function OsvUploadBlock() {
  const upload = useUploadOsvFiles();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ rows: number; accounts: string[]; branches: string[]; errors: string[] } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    setState("loading");
    setResult(null);
    setErrorMsg("");
    try {
      const res = await upload.mutateAsync(accepted);
      setResult(res);
      setState("success");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Ошибка загрузки");
      setState("error");
    }
  }, [upload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    multiple: true,
    disabled: state === "loading",
  });

  return (
    <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-indigo-100 flex items-center gap-2 bg-indigo-50/40">
        <FileSpreadsheet size={14} className="text-indigo-500" />
        <span className="text-sm font-bold text-gray-900">Загрузка ОСВ файлов</span>
        <span className="text-xs text-gray-400 ml-1">— 1210 / 3310 / 1710 напрямую</span>
      </div>
      <div className="p-5">
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
            isDragActive ? "border-indigo-500 bg-indigo-50"
            : state === "success" ? "border-green-400 bg-green-50"
            : state === "error" ? "border-red-300 bg-red-50"
            : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
          )}
        >
          <input {...getInputProps()} />
          {state === "loading" ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="text-indigo-500 animate-spin" />
              <div className="text-sm font-medium text-gray-600">Обрабатываем файлы...</div>
            </div>
          ) : state === "success" && result ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle size={28} className="text-green-500" />
              <div className="text-sm font-bold text-green-700">Загружено успешно</div>
              <div className="text-xs text-gray-600">
                <span className="font-black text-green-700 text-base mr-1">{result.rows}</span>
                строк | Счета: {result.accounts.join(", ")} | Филиалы: {result.branches.length}
              </div>
              {result.errors?.length > 0 && (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                  ⚠ {result.errors[0]}
                </div>
              )}
              <button className="text-xs text-gray-400 hover:text-gray-600 mt-1"
                onClick={(e) => { e.stopPropagation(); setState("idle"); }}>
                Загрузить ещё
              </button>
            </div>
          ) : state === "error" ? (
            <div className="flex flex-col items-center gap-3">
              <XCircle size={28} className="text-red-500" />
              <div className="text-sm font-bold text-red-600">Ошибка загрузки</div>
              <div className="text-xs text-red-500 max-w-xs">{errorMsg}</div>
              <button className="mt-1 text-xs text-blue-700 hover:underline"
                onClick={(e) => { e.stopPropagation(); setState("idle"); }}>
                Попробовать снова
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                <FileSpreadsheet size={22} className="text-indigo-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-700">
                  {isDragActive ? "Отпустите файлы" : "Перетащите файлы ОСВ или кликните"}
                </div>
                <div className="text-xs text-gray-400 mt-1">Можно выбрать несколько файлов сразу</div>
                <div className="text-xs text-gray-300 mt-1 font-mono">1210 Береке 30.03.26.xls · 3310 Астана 30.03.26.xls</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OsvSyncBlock() {
  const { data: cfg, isLoading } = useOsvFolderConfig();
  const saveConfig = useSaveOsvFolderConfig();
  const scan = useScanOsvFolder();
  const [editing, setEditing] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [scanResult, setScanResult] = useState<{ rows: number; accounts: string[]; branches: string[] } | null>(null);

  const handleSave = async () => {
    await saveConfig.mutateAsync({ osv_folder: folderInput });
    setEditing(false);
  };

  const handleScan = async () => {
    setScanResult(null);
    const res = await scan.mutateAsync();
    setScanResult({ rows: res.rows, accounts: res.accounts, branches: res.branches });
  };

  const hasFolder = !!cfg?.osv_folder;

  return (
    <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-indigo-100 flex items-center gap-2 bg-indigo-50/40">
        <FileSpreadsheet size={14} className="text-indigo-500" />
        <span className="text-sm font-bold text-gray-900">Загрузка ОСВ (дебиторка)</span>
        <span className="text-xs text-gray-400 ml-1">— 1210 / 3310 / 1710</span>
        <button
          onClick={() => { setEditing(!editing); setFolderInput(cfg?.osv_folder ?? ""); }}
          className="ml-auto p-1.5 rounded hover:bg-indigo-100 text-gray-400 hover:text-gray-600"
          title="Настройки папки"
        >
          <Settings size={14} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {editing && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Путь к папке с файлами ОСВ</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="C:\Users\Askhat\OneDrive\Рабочий стол\Real Trade\Для анализа"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSave}
                disabled={saveConfig.isPending}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-40"
              >
                {saveConfig.isPending ? <Loader2 size={14} className="animate-spin" /> : "Сохранить"}
              </button>
            </div>
            <div className="text-xs text-gray-400">
              Папка с файлами вида: «1210 Береке 30.03.26.xls», «3310 Астана 30.03.26.xls» и т.д.
            </div>
          </div>
        )}

        {!isLoading && (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              {hasFolder ? (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 font-mono truncate">{cfg.osv_folder}</div>
                  <div className="text-xs text-gray-600">
                    Найдено файлов: <span className="font-semibold text-indigo-700">{cfg.file_count}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  Папка не настроена — нажми <Settings size={12} className="inline" /> чтобы указать путь
                </div>
              )}
            </div>

            <button
              onClick={handleScan}
              disabled={!hasFolder || cfg?.file_count === 0 || scan.isPending}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                hasFolder && cfg?.file_count && cfg.file_count > 0
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
            >
              {scan.isPending
                ? <><Loader2 size={15} className="animate-spin" /> Загружаем...</>
                : <><RefreshCw size={15} /> Загрузить ОСВ</>}
            </button>
          </div>
        )}

        {scanResult && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle size={16} className="text-green-500" />
            <span className="text-sm text-green-800 font-medium">
              Загружено {scanResult.rows.toLocaleString("ru")} строк | Счета: {scanResult.accounts.join(", ")} | Филиалы: {scanResult.branches.length}
            </span>
          </div>
        )}
        {scan.isError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <XCircle size={16} className="text-red-500" />
            <span className="text-sm text-red-700">{(scan.error as Error).message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UploadPage() {
  const uploadSalesMutation = useUploadSales();
  const uploadStockMutation = useUploadStock();
  const { data: history = [], isLoading: historyLoading } = useUploadHistory();
  const deleteUpload = useDeleteUpload();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить загрузку и все связанные данные?")) return;
    setDeletingId(id);
    try {
      await deleteUpload.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      {/* One-click sync from folder */}
      <SyncFromFolderBlock />

      {/* OSV direct file upload */}
      <OsvUploadBlock />

      {/* OSV sync block (local folder - for desktop use) */}
      <OsvSyncBlock />

      {/* Upload zones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <DropZone
          type="sales"
          label="Продажи и оплаты"
          hint="03_2026_Продажи_и_оплаты.xlsx"
          onUpload={uploadSalesMutation.mutateAsync}
        />
        <DropZone
          type="stock"
          label="Сток и остатки"
          hint="сток_и_продажи_филиалы.xls"
          onUpload={uploadStockMutation.mutateAsync}
        />
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 border-l-4 border-l-blue-600 rounded-lg px-5 py-4">
        <div className="text-sm font-semibold text-blue-900 mb-1">Как это работает</div>
        <ul className="text-xs text-blue-700 space-y-1 leading-relaxed">
          <li>1. Загружай файлы из 1С (продажи и/или сток)</li>
          <li>2. Система парсит их и сохраняет в базу данных</li>
          <li>3. После загрузки кнопка перенесёт тебя к данным</li>
          <li>4. Дубликаты за ту же дату перезаписываются автоматически</li>
        </ul>
      </div>

      {/* Upload history */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Clock size={14} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-900">История загрузок</span>
        </div>

        {historyLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Загрузка...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Загрузок ещё не было</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Файл</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Тип</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Строк</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Дата</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Статус</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, i) => (
                <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="px-5 py-3 font-mono text-xs text-gray-600 max-w-[200px] truncate">
                    {row.filename}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      row.upload_type === "sales"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-purple-50 text-purple-700"
                    }`}>
                      {row.upload_type === "sales" ? "Продажи" : "Сток"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                    {row.rows_processed.toLocaleString("ru")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.period_date}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      row.status === "ok"
                        ? "bg-green-50 text-green-700"
                        : row.status === "partial"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {row.status === "ok" ? "✓ OK" : row.status === "partial" ? "⚠ Частично" : "✗ Ошибка"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => handleDelete(row.id)}
                      disabled={deletingId === row.id}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                      title="Удалить загрузку"
                    >
                      {deletingId === row.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
