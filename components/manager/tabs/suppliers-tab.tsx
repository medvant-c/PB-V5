"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, Mail, MapPin, MessageCircle, Phone, Pencil, Plus, Search, Store, Trash2, User, Wallet } from "lucide-react";
import { EmptyState } from "@/components/desk/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhotoPicker } from "@/components/manager/photo-picker";
import { PhotoLightbox } from "@/components/manager/photo-lightbox";
import { SupplierDocumentsPanel } from "@/components/manager/supplier-documents-panel";
import { cn } from "@/lib/utils";

interface CategoryRecord {
  id: string;
  name: string;
  emoji: string | null;
  sortOrder: number;
  supplierCount: number;
}

interface SupplierRecord {
  id: string;
  displayId: number;
  name: string;
  description: string | null;
  paymentInfo: string | null;
  location: string | null;
  contactPerson: string | null;
  wechat: string | null;
  whatsapp: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  createdByManager: { id: string; name: string };
  previewPhotoId: string | null;
  category: { id: string; name: string; emoji: string | null };
}

interface SupplierPhoto {
  id: string;
  originalName: string;
}

const BLANK_FORM = {
  name: "",
  description: "",
  paymentInfo: "",
  location: "",
  contactPerson: "",
  wechat: "",
  whatsapp: "",
  email: "",
  phone: "",
};

function ManagerSuppliersTab() {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categorySearch, setCategorySearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);
  const [expandedPhotos, setExpandedPhotos] = useState<SupplierPhoto[]>([]);

  // Поиск по всем поставщикам сразу (не только в выбранной категории) —
  // менеджер не обязан помнить, в какой из ~45 категорий лежит нужный
  // поставщик. См. PB-V5 chat 2026-08-27.
  const [supplierQuery, setSupplierQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SupplierRecord[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const loadCategories = useCallback(() => {
    setLoadingCategories(true);
    return fetch("/api/supplier-categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .finally(() => setLoadingCategories(false));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const loadSuppliers = useCallback((categoryId: string) => {
    setLoadingSuppliers(true);
    return fetch(`/api/suppliers?categoryId=${categoryId}`)
      .then((res) => res.json())
      .then((data) => setSuppliers(data.suppliers ?? []))
      .finally(() => setLoadingSuppliers(false));
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) {
      setSuppliers([]);
      return;
    }
    setExpandedSupplierId(null);
    loadSuppliers(selectedCategoryId);
  }, [selectedCategoryId, loadSuppliers]);

  const runSearch = useCallback((q: string) => {
    setSearchLoading(true);
    return fetch(`/api/suppliers?q=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((data) => setSearchResults(data.suppliers ?? []))
      .finally(() => setSearchLoading(false));
  }, []);

  useEffect(() => {
    const q = supplierQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => runSearch(q), 300);
    return () => clearTimeout(timer);
  }, [supplierQuery, runSearch]);

  const isSearching = supplierQuery.trim().length > 0;

  const selectedCategory = useMemo(() => categories.find((c) => c.id === selectedCategoryId) ?? null, [categories, selectedCategoryId]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  async function handleCreateCategory(event: React.FormEvent) {
    event.preventDefault();
    if (creatingCategory || !newCategoryName.trim()) return;
    setCreatingCategory(true);
    setCategoryError(null);
    try {
      const res = await fetch("/api/supplier-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName, emoji: newCategoryEmoji }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCategoryError(data.error ?? "Не удалось создать категорию.");
        return;
      }
      setNewCategoryName("");
      setNewCategoryEmoji("");
      setShowNewCategory(false);
      await loadCategories();
    } finally {
      setCreatingCategory(false);
    }
  }

  function openCreateDialog() {
    setEditingSupplier(null);
    setForm(BLANK_FORM);
    setPhotos([]);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(supplier: SupplierRecord) {
    setEditingSupplier(supplier);
    setForm({
      name: supplier.name,
      description: supplier.description ?? "",
      paymentInfo: supplier.paymentInfo ?? "",
      location: supplier.location ?? "",
      contactPerson: supplier.contactPerson ?? "",
      wechat: supplier.wechat ?? "",
      whatsapp: supplier.whatsapp ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
    });
    setPhotos([]);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !form.name.trim()) return;
    if (!editingSupplier && !selectedCategoryId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingSupplier) {
        const res = await fetch(`/api/suppliers/${editingSupplier.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error ?? "Не удалось сохранить изменения.");
          return;
        }
      } else {
        if (!selectedCategoryId) return;
        const formData = new FormData();
        formData.append("categoryId", selectedCategoryId);
        for (const [key, value] of Object.entries(form)) {
          if (value.trim()) formData.append(key, value.trim());
        }
        photos.forEach((photo, i) => formData.append(`photo${i}`, photo));
        const res = await fetch("/api/suppliers", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error ?? "Не удалось добавить поставщика.");
          return;
        }
      }
      setDialogOpen(false);
      const tasks = [loadCategories()];
      if (selectedCategoryId) tasks.push(loadSuppliers(selectedCategoryId));
      if (isSearching) tasks.push(runSearch(supplierQuery.trim()));
      await Promise.all(tasks);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Удалить эту карточку поставщика?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setExpandedSupplierId(null);
        const tasks = [loadCategories()];
        if (selectedCategoryId) tasks.push(loadSuppliers(selectedCategoryId));
        if (isSearching) tasks.push(runSearch(supplierQuery.trim()));
        await Promise.all(tasks);
      } else {
        const data = await res.json();
        window.alert(data.error ?? "Не удалось удалить.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleExpand(supplier: SupplierRecord) {
    if (expandedSupplierId === supplier.id) {
      setExpandedSupplierId(null);
      return;
    }
    setExpandedSupplierId(supplier.id);
    const res = await fetch(`/api/suppliers/${supplier.id}`);
    const data = await res.json();
    setExpandedPhotos(res.ok ? (data.photos ?? []) : []);
  }

  // Общий рендер карточки поставщика — используется и для списка внутри
  // категории, и для результатов сквозного поиска (showCategory отличает
  // второй случай, где нужно показать, в какой категории лежит поставщик).
  function renderSupplierRow(supplier: SupplierRecord, showCategory: boolean) {
    const expanded = expandedSupplierId === supplier.id;
    return (
      <li key={supplier.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
        <div className="flex w-full items-center gap-3 text-left">
          {supplier.previewPhotoId ? (
            <button
              type="button"
              onClick={() => setPreviewPhotoUrl(`/api/suppliers/photos/${supplier.previewPhotoId}`)}
              className="shrink-0"
              aria-label="Увеличить фото"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- session-gated API route, not a static asset */}
              <img
                src={`/api/suppliers/photos/${supplier.previewPhotoId}`}
                alt=""
                className="h-12 w-12 rounded-lg object-cover transition-opacity hover:opacity-80"
              />
            </button>
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-bg text-text-secondary">
              <Store className="h-5 w-5" />
            </div>
          )}
          <button type="button" onClick={() => toggleExpand(supplier)} className="min-w-0 flex-1 text-left">
            <div className="truncate font-medium text-text">
              №{supplier.displayId} {supplier.name}
            </div>
            {showCategory && (
              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-secondary">
                {supplier.category.emoji || "📦"} {supplier.category.name}
              </div>
            )}
            {supplier.description && <div className="truncate text-xs text-text-secondary">{supplier.description}</div>}
          </button>
        </div>

        {expanded && (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            {supplier.description && <p className="text-text-secondary">{supplier.description}</p>}
            {supplier.paymentInfo && (
              <p className="flex items-start gap-1.5 text-text-secondary">
                <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {supplier.paymentInfo}
              </p>
            )}
            {supplier.location && (
              <p className="flex items-start gap-1.5 text-text-secondary">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {supplier.location}
              </p>
            )}
            {supplier.contactPerson && (
              <p className="flex items-start gap-1.5 text-text-secondary">
                <User className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {supplier.contactPerson}
              </p>
            )}
            {supplier.wechat && (
              <p className="flex items-start gap-1.5 text-text-secondary">
                <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> WeChat: {supplier.wechat}
              </p>
            )}
            {supplier.whatsapp && (
              <p className="flex items-start gap-1.5 text-text-secondary">
                <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> WhatsApp: {supplier.whatsapp}
              </p>
            )}
            {supplier.email && (
              <p className="flex items-start gap-1.5 text-text-secondary">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {supplier.email}
              </p>
            )}
            {supplier.phone && (
              <p className="flex items-start gap-1.5 text-text-secondary">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {supplier.phone}
              </p>
            )}

            {expandedPhotos.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {expandedPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setPreviewPhotoUrl(`/api/suppliers/photos/${photo.id}`)}
                    className="shrink-0"
                    aria-label={`Увеличить фото: ${photo.originalName}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- session-gated API route, not a static asset */}
                    <img
                      src={`/api/suppliers/photos/${photo.id}`}
                      alt={photo.originalName}
                      className="h-24 w-24 rounded-lg border border-border object-cover transition-opacity hover:opacity-80"
                    />
                  </button>
                ))}
              </div>
            )}

            <SupplierDocumentsPanel supplierId={supplier.id} />

            <div className="flex items-center justify-between pt-2 text-xs text-text-secondary">
              <span>Добавил: {supplier.createdByManager.name}</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditDialog(supplier)}
                  className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-black/5 hover:text-primary"
                  aria-label="Редактировать"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(supplier.id)}
                  disabled={deletingId === supplier.id}
                  className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                  aria-label="Удалить"
                >
                  {deletingId === supplier.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-260px)] lg:min-h-140 lg:flex-row">
        {/* LEFT: category list */}
        <div
          className={cn(
            "w-full shrink-0 flex-col rounded-xl border border-border bg-surface lg:flex lg:w-80",
            selectedCategory || isSearching ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">Категории · {filteredCategories.length}</h2>
              {!showNewCategory && (
                <Button type="button" size="sm" variant="outline" onClick={() => setShowNewCategory(true)}>
                  <Plus className="h-3.5 w-3.5" /> Новая
                </Button>
              )}
            </div>
            <Input
              placeholder="Поиск категории…"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              className="h-8 text-xs"
            />
            {showNewCategory && (
              <form onSubmit={handleCreateCategory} className="space-y-1.5 rounded-lg border border-border bg-bg p-2">
                <div className="flex gap-1.5">
                  <Input
                    placeholder="🏠"
                    value={newCategoryEmoji}
                    onChange={(e) => setNewCategoryEmoji(e.target.value)}
                    className="h-8 w-12 text-center text-sm"
                    maxLength={4}
                  />
                  <Input
                    placeholder="Название категории"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="h-8 flex-1 text-xs"
                    autoFocus
                  />
                </div>
                {categoryError && <p className="text-xs text-error">{categoryError}</p>}
                <div className="flex gap-1.5">
                  <Button type="submit" size="sm" disabled={creatingCategory || !newCategoryName.trim()}>
                    {creatingCategory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Создать"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowNewCategory(false)}>
                    Отмена
                  </Button>
                </div>
              </form>
            )}
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {loadingCategories ? (
              <p className="p-2 text-xs text-text-secondary">Загрузка…</p>
            ) : filteredCategories.length === 0 ? (
              <p className="p-2 text-xs text-text-secondary">Категорий не найдено.</p>
            ) : (
              filteredCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(category.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    selectedCategoryId === category.id ? "bg-primary/10 text-primary" : "text-text hover:bg-bg",
                  )}
                >
                  <span className="shrink-0 text-base">{category.emoji || "📦"}</span>
                  <span className="min-w-0 flex-1 truncate">{category.name}</span>
                  <span className="shrink-0 text-xs text-text-secondary">{category.supplierCount}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: suppliers in the selected category, or search results */}
        <div
          className={cn(
            "min-w-0 flex-1 overflow-y-auto rounded-xl border border-border bg-bg p-4 lg:block lg:min-h-0",
            selectedCategory || isSearching ? "block" : "hidden lg:block",
          )}
        >
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
              <Input
                placeholder="Поиск поставщика по названию, контактам, реквизитам…"
                value={supplierQuery}
                onChange={(e) => setSupplierQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {isSearching ? (
              searchLoading ? (
                <p className="text-xs text-text-secondary">Поиск…</p>
              ) : searchResults.length === 0 ? (
                <EmptyState icon={Store} compact message="Ничего не найдено." />
              ) : (
                <ul className="space-y-2">{searchResults.map((supplier) => renderSupplierRow(supplier, true))}</ul>
              )
            ) : !selectedCategory ? (
              <EmptyState icon={Store} message="Выберите категорию слева, чтобы увидеть поставщиков." />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(null)}
                  className="-ml-1 flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-primary lg:hidden"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Назад к категориям
                </button>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-text">
                    {selectedCategory.emoji || "📦"} {selectedCategory.name} · {suppliers.length}
                  </h3>
                  <Button type="button" size="sm" onClick={openCreateDialog}>
                    <Plus className="h-3.5 w-3.5" /> Добавить поставщика
                  </Button>
                </div>

                {loadingSuppliers ? (
                  <p className="text-xs text-text-secondary">Загрузка…</p>
                ) : suppliers.length === 0 ? (
                  <EmptyState icon={Store} compact message="В этой категории пока нет поставщиков." />
                ) : (
                  <ul className="space-y-2">{suppliers.map((supplier) => renderSupplierRow(supplier, false))}</ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Редактировать поставщика" : "Новый поставщик"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input placeholder="Название / компания" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            <Textarea
              placeholder="Чем занимается — ассортимент, преимущества и т.д."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
            />
            <Textarea
              placeholder="Реквизиты / способ перечисления денег"
              value={form.paymentInfo}
              onChange={(e) => setForm({ ...form, paymentInfo: e.target.value })}
              rows={2}
            />
            <Input placeholder="Где находится" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <Input
              placeholder="Контактное лицо"
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="WeChat" value={form.wechat} onChange={(e) => setForm({ ...form, wechat: e.target.value })} />
              <Input placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
              <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            {!editingSupplier && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-text-secondary">Фото витрины</p>
                <PhotoPicker photos={photos} onChange={setPhotos} maxPhotos={10} />
              </div>
            )}
            {formError && <p className="text-xs text-error">{formError}</p>}
            <Button type="submit" disabled={submitting || !form.name.trim()} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingSupplier ? "Сохранить" : "Добавить"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <PhotoLightbox src={previewPhotoUrl} onClose={() => setPreviewPhotoUrl(null)} />
    </div>
  );
}

export { ManagerSuppliersTab };
