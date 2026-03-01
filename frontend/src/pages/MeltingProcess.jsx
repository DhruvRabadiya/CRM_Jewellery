import React, { useState, useEffect, useCallback } from "react";
import {
  Flame,
  CheckCircle,
  ArrowDownLeft,
  Weight,
  AlertTriangle,
  Edit3,
  Trash2,
  Clock,
  Calendar,
} from "lucide-react";
import {
  getRunningMelts,
  getCompletedMelts as fetchCompletedMelts,
  startMelt,
  completeMelt,
  updateMelt,
  updateCompletedMelt,
  deleteMelt,
} from "../api/meltingService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";

const MeltingProcess = () => {
  const [activeMelts, setActiveMelts] = useState([]);
  const [completedMelts, setCompletedMelts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal States
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isEditRunningModalOpen, setIsEditRunningModalOpen] = useState(false);
  const [isEditCompletedModalOpen, setIsEditCompletedModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedMelt, setSelectedMelt] = useState(null);
  const [deletingMelt, setDeletingMelt] = useState(null);

  // Form States
  const [startForm, setStartForm] = useState({
    metal_type: "Gold",
    issue_weight: "",
    weight_unit: "g",
  });
  const [completeForm, setCompleteForm] = useState({
    return_weight: "",
    scrap_weight: "",
    weight_unit: "g",
  });
  const [editRunningForm, setEditRunningForm] = useState({
    metal_type: "Gold",
    issue_weight: "",
    weight_unit: "g",
  });
  const [editCompletedForm, setEditCompletedForm] = useState({
    return_weight: "",
    scrap_weight: "",
    weight_unit: "g",
  });
  const [isShaking, setIsShaking] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerError = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  // Fetch Active Melts
  const fetchMelts = useCallback(async () => {
    try {
      const [runningResult, completedResult] = await Promise.all([
        getRunningMelts(),
        fetchCompletedMelts(),
      ]);
      if (runningResult.success) setActiveMelts(runningResult.data);
      if (completedResult.success) setCompletedMelts(completedResult.data);
    } catch (error) {
      showToast("Failed to load melts", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMelts();
  }, [fetchMelts]);

  // Handle Start Melt
  const handleStartMelt = async (e) => {
    e.preventDefault();
    if (!startForm.issue_weight || parseFloat(startForm.issue_weight) <= 0) {
      triggerError();
      showToast("Invalid Issue Weight", "error");
      return;
    }

    let finalWeight = parseFloat(startForm.issue_weight);
    if (startForm.weight_unit === "kg") {
      finalWeight *= 1000;
    }

    try {
      await startMelt(startForm.metal_type, finalWeight);
      showToast("Melting Started Successfully!", "success");
      setIsStartModalOpen(false);
      setStartForm({ metal_type: "Gold", issue_weight: "", weight_unit: "g" });
      fetchMelts();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to start melt (Check Stock)", "error");
    }
  };

  // Handle Complete Melt
  const handleCompleteMelt = async (e) => {
    e.preventDefault();

    let retWeight = parseFloat(completeForm.return_weight) || 0;
    let scrWeight = parseFloat(completeForm.scrap_weight) || 0;

    if (completeForm.weight_unit === "kg") {
      retWeight *= 1000;
      scrWeight *= 1000;
    }

    if (retWeight <= 0) {
      triggerError();
      showToast("Return weight must be greater than 0", "error");
      return;
    }

    if (liveLoss < 0) {
      triggerError();
      showToast("Error: Return + Scrap exceeds Issue Weight!", "error");
      return;
    }

    try {
      await completeMelt(selectedMelt.id, retWeight, scrWeight);
      showToast("Melting Completed & Stock Updated!", "success");
      setIsCompleteModalOpen(false);
      setCompleteForm({
        return_weight: "",
        scrap_weight: "",
        weight_unit: selectedMelt.metal_type === "Silver" ? "kg" : "g",
      });
      setSelectedMelt(null);
      fetchMelts();
    } catch (error) {
      triggerError();
      showToast("Failed to complete melt", "error");
    }
  };

  const openCompleteModal = (melt) => {
    setSelectedMelt(melt);
    setCompleteForm({
      return_weight: "",
      scrap_weight: "",
      weight_unit: melt.metal_type === "Silver" ? "kg" : "g",
    });
    setIsCompleteModalOpen(true);
  };

  // --- EDIT RUNNING MELT ---
  const openEditRunningModal = (melt) => {
    setSelectedMelt(melt);
    setEditRunningForm({
      metal_type: melt.metal_type,
      issue_weight: melt.metal_type === "Silver"
        ? (melt.issue_weight / 1000).toString()
        : melt.issue_weight.toString(),
      weight_unit: melt.metal_type === "Silver" ? "kg" : "g",
    });
    setIsEditRunningModalOpen(true);
  };

  const handleEditRunningMelt = async (e) => {
    e.preventDefault();
    if (!editRunningForm.issue_weight || parseFloat(editRunningForm.issue_weight) <= 0) {
      triggerError();
      showToast("Invalid Issue Weight", "error");
      return;
    }

    let finalWeight = parseFloat(editRunningForm.issue_weight);
    if (editRunningForm.weight_unit === "kg") {
      finalWeight *= 1000;
    }

    setActionLoading(true);
    try {
      const result = await updateMelt(selectedMelt.id, {
        metal_type: editRunningForm.metal_type,
        issue_weight: finalWeight,
      });
      if (result.success) {
        showToast("Melting process updated!", "success");
        setIsEditRunningModalOpen(false);
        setSelectedMelt(null);
        fetchMelts();
      } else {
        triggerError();
        showToast(result.message || "Update failed", "error");
      }
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to update melt", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // --- EDIT COMPLETED MELT ---
  const openEditCompletedModal = (melt) => {
    setSelectedMelt(melt);
    const unit = melt.metal_type === "Silver" ? "kg" : "g";
    const divisor = unit === "kg" ? 1000 : 1;
    setEditCompletedForm({
      return_weight: (melt.return_weight / divisor).toString(),
      scrap_weight: (melt.scrap_weight / divisor).toString(),
      weight_unit: unit,
    });
    setIsEditCompletedModalOpen(true);
  };

  const handleEditCompletedMelt = async (e) => {
    e.preventDefault();

    let retW = parseFloat(editCompletedForm.return_weight) || 0;
    let scrW = parseFloat(editCompletedForm.scrap_weight) || 0;

    if (editCompletedForm.weight_unit === "kg") {
      retW *= 1000;
      scrW *= 1000;
    }

    if (retW < 0 || scrW < 0) {
      triggerError();
      showToast("Weights cannot be negative", "error");
      return;
    }

    if (editCompletedLoss < 0) {
      triggerError();
      showToast("Return + Scrap cannot exceed Issue Weight!", "error");
      return;
    }

    setActionLoading(true);
    try {
      const result = await updateCompletedMelt(selectedMelt.id, {
        return_weight: retW,
        scrap_weight: scrW,
      });
      if (result.success) {
        showToast("Completed melt updated!", "success");
        setIsEditCompletedModalOpen(false);
        setSelectedMelt(null);
        fetchMelts();
      } else {
        triggerError();
        showToast(result.message || "Update failed", "error");
      }
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to update completed melt", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // --- DELETE MELT ---
  const openDeleteModal = (melt) => {
    setDeletingMelt(melt);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteMelt = async () => {
    if (!deletingMelt) return;
    setActionLoading(true);
    try {
      const result = await deleteMelt(deletingMelt.id);
      if (result.success) {
        showToast("Melting process deleted & stock reversed!", "success");
        setIsDeleteModalOpen(false);
        setDeletingMelt(null);
        fetchMelts();
      } else {
        showToast(result.message || "Delete failed", "error");
      }
    } catch (error) {
      showToast(error.message || "Failed to delete melt", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // --- REAL-TIME LOSS CALCULATION (Complete Modal) ---
  const issueW = selectedMelt ? parseFloat(selectedMelt.issue_weight) || 0 : 0;
  let returnW = parseFloat(completeForm.return_weight) || 0;
  let scrapW = parseFloat(completeForm.scrap_weight) || 0;

  if (completeForm.weight_unit === "kg") {
    returnW *= 1000;
    scrapW *= 1000;
  }

  const liveLoss = parseFloat((issueW - (returnW + scrapW)).toFixed(3));
  const isLossNegative = liveLoss < 0;

  // --- REAL-TIME LOSS CALCULATION (Edit Completed Modal) ---
  const editIssueW = selectedMelt ? parseFloat(selectedMelt.issue_weight) || 0 : 0;
  let editReturnW = parseFloat(editCompletedForm.return_weight) || 0;
  let editScrapW = parseFloat(editCompletedForm.scrap_weight) || 0;

  if (editCompletedForm.weight_unit === "kg") {
    editReturnW *= 1000;
    editScrapW *= 1000;
  }

  const editCompletedLoss = parseFloat((editIssueW - (editReturnW + editScrapW)).toFixed(3));
  const isEditLossNegative = editCompletedLoss < 0;

  // --- FORMAT DATE ---
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // --- WEIGHT DISPLAY HELPER ---
  const displayWeight = (weight, metalType) => {
    if (metalType === "Silver") {
      return `${(weight / 1000).toFixed(3)} kg`;
    }
    return `${weight.toFixed(3)} g`;
  };

  if (loading)
    return (
      <div className="p-8 text-center animate-pulse">
        Loading Melting Data...
      </div>
    );

  return (
    <div className="p-6 relative">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
            Melting Process
          </h1>
          <p className="text-gray-500 mt-1">
            Convert Raw Material to Pure Dhal
          </p>
        </div>
        <button
          onClick={() => setIsStartModalOpen(true)}
          className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-xl hover:bg-orange-700 shadow-lg active:scale-95 transition-all"
        >
          <Flame size={20} />{" "}
          <span className="font-semibold">Start New Melt</span>
        </button>
      </div>

      {/* ACTIVE MELTS GRID */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2">
          <Clock size={20} className="text-orange-500" /> Active Melts
          <span className="text-sm font-normal text-gray-400 ml-2">({activeMelts.length})</span>
        </h2>

        {activeMelts.length === 0 ? (
          <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500">
            <Flame size={48} className="mx-auto mb-3 opacity-20" />
            <p>No active melting processes.</p>
            <p className="text-sm">Click "Start New Melt" to begin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeMelts.map((melt) => (
              <div
                key={melt.id}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div
                  className={`absolute top-0 left-0 w-full h-1 ${melt.metal_type === "Gold" ? "bg-yellow-400" : "bg-gray-400"}`}
                ></div>

                <div className="flex justify-between items-start mb-4 mt-2">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Process #{melt.id}
                    </p>
                    <h3
                      className={`text-xl font-bold ${melt.metal_type === "Gold" ? "text-yellow-600" : "text-gray-600"}`}
                    >
                      {melt.metal_type} Melt
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-pulse">
                      <Flame size={12} /> Running
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-100">
                  <p className="text-sm text-gray-500 font-medium">
                    Issued Weight
                  </p>
                  <p className="text-2xl font-bold text-gray-800">
                    {displayWeight(melt.issue_weight, melt.metal_type)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openCompleteModal(melt)}
                    className="flex-1 bg-green-50 text-green-700 font-bold py-3 rounded-xl hover:bg-green-600 hover:text-white transition-colors flex justify-center items-center gap-2"
                  >
                    <CheckCircle size={18} /> Complete
                  </button>
                  <button
                    onClick={() => openEditRunningModal(melt)}
                    className="bg-blue-50 text-blue-600 font-bold px-4 py-3 rounded-xl hover:bg-blue-600 hover:text-white transition-colors flex items-center justify-center"
                    title="Edit"
                  >
                    <Edit3 size={18} />
                  </button>
                  <button
                    onClick={() => openDeleteModal(melt)}
                    className="bg-red-50 text-red-600 font-bold px-4 py-3 rounded-xl hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COMPLETED MELTS TABLE */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2">
          <CheckCircle size={20} className="text-green-500" /> Completed Melts
          <span className="text-sm font-normal text-gray-400 ml-2">({completedMelts.length})</span>
        </h2>

        {completedMelts.length === 0 ? (
          <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500">
            <CheckCircle size={48} className="mx-auto mb-3 opacity-20" />
            <p>No completed melting processes yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-bold text-gray-600 uppercase tracking-wider text-xs">#</th>
                    <th className="text-left py-3 px-4 font-bold text-gray-600 uppercase tracking-wider text-xs">Metal</th>
                    <th className="text-right py-3 px-4 font-bold text-gray-600 uppercase tracking-wider text-xs">Issued</th>
                    <th className="text-right py-3 px-4 font-bold text-gray-600 uppercase tracking-wider text-xs">Return (Dhal)</th>
                    <th className="text-right py-3 px-4 font-bold text-gray-600 uppercase tracking-wider text-xs">Scrap</th>
                    <th className="text-right py-3 px-4 font-bold text-gray-600 uppercase tracking-wider text-xs">Loss</th>
                    <th className="text-left py-3 px-4 font-bold text-gray-600 uppercase tracking-wider text-xs">Completed</th>
                    <th className="text-center py-3 px-4 font-bold text-gray-600 uppercase tracking-wider text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {completedMelts.map((melt, idx) => (
                    <tr
                      key={melt.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}
                    >
                      <td className="py-3 px-4 font-bold text-gray-500">#{melt.id}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${melt.metal_type === "Gold" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"}`}>
                          {melt.metal_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-800">
                        {displayWeight(melt.issue_weight, melt.metal_type)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-green-700">
                        {displayWeight(melt.return_weight, melt.metal_type)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-600">
                        {displayWeight(melt.scrap_weight, melt.metal_type)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-bold ${melt.loss_weight > 0 ? "text-red-600" : "text-gray-400"}`}>
                          {displayWeight(melt.loss_weight, melt.metal_type)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(melt.completed_at)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditCompletedModal(melt)}
                            className="p-2 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(melt)}
                            className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: START MELT */}
      <Modal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        title="Start Melting Process"
      >
        <form
          onSubmit={handleStartMelt}
          className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
        >
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Metal Type
            </label>
            <div className="relative">
              <select
                className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none cursor-pointer"
                value={startForm.metal_type}
                onChange={(e) =>
                  setStartForm({ ...startForm, metal_type: e.target.value })
                }
              >
                <option value="Gold">Gold</option>
                <option value="Silver">Silver</option>
              </select>
              <ArrowDownLeft
                className="absolute right-4 top-3 text-gray-500 pointer-events-none"
                size={16}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Issue Weight (from Opening Stock)
            </label>
            <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-orange-500 transition-colors overflow-hidden">
              <input
                type="number"
                step="0.001"
                className="w-full bg-transparent text-gray-700 py-3 px-4 outline-none font-bold"
                value={startForm.issue_weight}
                onChange={(e) =>
                  setStartForm({ ...startForm, issue_weight: e.target.value })
                }
                placeholder="0.000"
              />
              <select
                className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none"
                value={startForm.weight_unit}
                onChange={(e) =>
                  setStartForm({ ...startForm, weight_unit: e.target.value })
                }
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 shadow-md active:scale-95 transition-all flex justify-center gap-2"
          >
            <Flame size={20} /> Ignite Furnace
          </button>
        </form>
      </Modal>

      {/* MODAL 2: COMPLETE MELT (WITH REAL-TIME LOSS) */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title="Complete Melting"
      >
        {selectedMelt && (
          <form
            onSubmit={handleCompleteMelt}
            className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
          >
            {/* Issued Weight Indicator */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
              <span className="text-blue-800 font-semibold">
                Total Issued Weight ({completeForm?.weight_unit || "g"}):
              </span>
              <span className="text-xl font-bold text-blue-900">
                {(
                  issueW / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                  Weight Unit
                </label>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() =>
                      setCompleteForm({ ...completeForm, weight_unit: "g" })
                    }
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${completeForm.weight_unit === "g" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    Grams (g)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCompleteForm({ ...completeForm, weight_unit: "kg" })
                    }
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${completeForm.weight_unit === "kg" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    Kilogram (kg)
                  </button>
                </div>
              </div>

              {/* Return Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide flex items-center gap-1">
                  <Weight size={14} /> Pure Dhal
                </label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-3 rounded-lg outline-none focus:bg-white focus:border-green-500 transition-colors text-lg font-bold"
                  value={completeForm.return_weight}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      return_weight: e.target.value,
                    })
                  }
                  placeholder={`0.000 ${completeForm.weight_unit}`}
                />
              </div>

              {/* Scrap Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                  Scrap / Dust
                </label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-3 rounded-lg outline-none focus:bg-white focus:border-gray-500 transition-colors text-lg font-bold"
                  value={completeForm.scrap_weight}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      scrap_weight: e.target.value,
                    })
                  }
                  placeholder={`0.000 ${completeForm.weight_unit}`}
                />
              </div>
            </div>

            {/* DYNAMIC LOSS CALCULATOR */}
            <div
              className={`p-4 rounded-xl border flex justify-between items-center transition-colors ${
                isLossNegative
                  ? "bg-red-50 border-red-200 text-red-700"
                  : liveLoss > 0
                    ? "bg-orange-50 border-orange-200 text-orange-700"
                    : "bg-gray-50 border-gray-200 text-gray-500"
              }`}
            >
              <span className="font-bold flex items-center gap-2">
                {isLossNegative ? <AlertTriangle size={18} /> : null}
                Calculated Loss:
              </span>
              <span className="text-2xl font-extrabold">
                {(
                  liveLoss / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>
            {isLossNegative && (
              <p className="text-red-500 text-xs text-center font-bold">
                Error: Return + Scrap cannot be larger than Issued Weight!
              </p>
            )}

            <button
              type="submit"
              disabled={isLossNegative}
              className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 shadow-md active:scale-95 transition-all flex justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle size={20} /> Save to Inventory
            </button>
          </form>
        )}
      </Modal>

      {/* MODAL 3: EDIT RUNNING MELT */}
      <Modal
        isOpen={isEditRunningModalOpen}
        onClose={() => setIsEditRunningModalOpen(false)}
        title="Edit Running Melt"
      >
        {selectedMelt && (
          <form
            onSubmit={handleEditRunningMelt}
            className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
          >
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-sm text-blue-700 font-medium">
              Editing Process #{selectedMelt.id} — Stock will be adjusted automatically.
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Metal Type
              </label>
              <select
                className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none cursor-pointer"
                value={editRunningForm.metal_type}
                onChange={(e) =>
                  setEditRunningForm({ ...editRunningForm, metal_type: e.target.value })
                }
              >
                <option value="Gold">Gold</option>
                <option value="Silver">Silver</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Issue Weight
              </label>
              <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-blue-500 transition-colors overflow-hidden">
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-transparent text-gray-700 py-3 px-4 outline-none font-bold"
                  value={editRunningForm.issue_weight}
                  onChange={(e) =>
                    setEditRunningForm({ ...editRunningForm, issue_weight: e.target.value })
                  }
                  placeholder="0.000"
                />
                <select
                  className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none"
                  value={editRunningForm.weight_unit}
                  onChange={(e) =>
                    setEditRunningForm({ ...editRunningForm, weight_unit: e.target.value })
                  }
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={actionLoading}
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 shadow-md active:scale-95 transition-all flex justify-center gap-2 disabled:opacity-50"
            >
              <Edit3 size={20} /> {actionLoading ? "Updating..." : "Update Melt"}
            </button>
          </form>
        )}
      </Modal>

      {/* MODAL 4: EDIT COMPLETED MELT */}
      <Modal
        isOpen={isEditCompletedModalOpen}
        onClose={() => setIsEditCompletedModalOpen(false)}
        title="Edit Completed Melt"
      >
        {selectedMelt && (
          <form
            onSubmit={handleEditCompletedMelt}
            className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
          >
            <div className="bg-green-50 p-3 rounded-xl border border-green-100 text-sm text-green-700 font-medium">
              Editing Completed Melt #{selectedMelt.id} — Stock adjustments will be recalculated.
            </div>

            {/* Issue Weight (read-only) */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
              <span className="text-blue-800 font-semibold">
                Issue Weight ({editCompletedForm.weight_unit}):
              </span>
              <span className="text-xl font-bold text-blue-900">
                {(
                  editIssueW / (editCompletedForm.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                  Weight Unit
                </label>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() =>
                      setEditCompletedForm({ ...editCompletedForm, weight_unit: "g" })
                    }
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${editCompletedForm.weight_unit === "g" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    Grams (g)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditCompletedForm({ ...editCompletedForm, weight_unit: "kg" })
                    }
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${editCompletedForm.weight_unit === "kg" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    Kilogram (kg)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide flex items-center gap-1">
                  <Weight size={14} /> Pure Dhal
                </label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-3 rounded-lg outline-none focus:bg-white focus:border-green-500 transition-colors text-lg font-bold"
                  value={editCompletedForm.return_weight}
                  onChange={(e) =>
                    setEditCompletedForm({
                      ...editCompletedForm,
                      return_weight: e.target.value,
                    })
                  }
                  placeholder={`0.000 ${editCompletedForm.weight_unit}`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                  Scrap / Dust
                </label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-3 rounded-lg outline-none focus:bg-white focus:border-gray-500 transition-colors text-lg font-bold"
                  value={editCompletedForm.scrap_weight}
                  onChange={(e) =>
                    setEditCompletedForm({
                      ...editCompletedForm,
                      scrap_weight: e.target.value,
                    })
                  }
                  placeholder={`0.000 ${editCompletedForm.weight_unit}`}
                />
              </div>
            </div>

            {/* DYNAMIC LOSS CALCULATOR */}
            <div
              className={`p-4 rounded-xl border flex justify-between items-center transition-colors ${
                isEditLossNegative
                  ? "bg-red-50 border-red-200 text-red-700"
                  : editCompletedLoss > 0
                    ? "bg-orange-50 border-orange-200 text-orange-700"
                    : "bg-gray-50 border-gray-200 text-gray-500"
              }`}
            >
              <span className="font-bold flex items-center gap-2">
                {isEditLossNegative ? <AlertTriangle size={18} /> : null}
                Calculated Loss:
              </span>
              <span className="text-2xl font-extrabold">
                {(
                  editCompletedLoss / (editCompletedForm.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>
            {isEditLossNegative && (
              <p className="text-red-500 text-xs text-center font-bold">
                Error: Return + Scrap cannot be larger than Issued Weight!
              </p>
            )}

            <button
              type="submit"
              disabled={isEditLossNegative || actionLoading}
              className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 shadow-md active:scale-95 transition-all flex justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle size={20} /> {actionLoading ? "Updating..." : "Update Completed Melt"}
            </button>
          </form>
        )}
      </Modal>

      {/* MODAL 5: DELETE CONFIRMATION */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setDeletingMelt(null); }}
        title="Delete Melting Process"
      >
        {deletingMelt && (
          <div className="space-y-5">
            <div className="bg-red-50 p-4 rounded-xl border border-red-200 text-center">
              <AlertTriangle size={40} className="mx-auto mb-3 text-red-500" />
              <p className="text-red-800 font-bold text-lg mb-1">
                Are you sure?
              </p>
              <p className="text-red-600 text-sm">
                This will permanently delete <strong>Melt #{deletingMelt.id}</strong> ({deletingMelt.metal_type}) and <strong>reverse all stock changes</strong>.
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Status:</span>
                <span className={`font-bold ${deletingMelt.status === "RUNNING" ? "text-orange-600" : "text-green-600"}`}>
                  {deletingMelt.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Issue Weight:</span>
                <span className="font-bold text-gray-800">
                  {displayWeight(deletingMelt.issue_weight, deletingMelt.metal_type)}
                </span>
              </div>
              {deletingMelt.status === "COMPLETED" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Return (Dhal):</span>
                    <span className="font-bold text-green-700">
                      {displayWeight(deletingMelt.return_weight, deletingMelt.metal_type)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Scrap:</span>
                    <span className="font-bold text-gray-600">
                      {displayWeight(deletingMelt.scrap_weight, deletingMelt.metal_type)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Loss:</span>
                    <span className="font-bold text-red-600">
                      {displayWeight(deletingMelt.loss_weight, deletingMelt.metal_type)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setIsDeleteModalOpen(false); setDeletingMelt(null); }}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMelt}
                disabled={actionLoading}
                className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 shadow-md active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
              >
                <Trash2 size={18} /> {actionLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MeltingProcess;
