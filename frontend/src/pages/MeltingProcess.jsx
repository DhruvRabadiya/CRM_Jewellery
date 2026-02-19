import React, { useState, useEffect, useCallback } from "react";
import {
  Flame,
  CheckCircle,
  ArrowDownLeft,
  Weight,
  AlertTriangle,
} from "lucide-react";
import {
  getRunningMelts,
  startMelt,
  completeMelt,
} from "../api/meltingService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";

const MeltingProcess = () => {
  const [activeMelts, setActiveMelts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal States
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [selectedMelt, setSelectedMelt] = useState(null);

  // Form States
  const [startForm, setStartForm] = useState({
    metal_type: "Gold",
    issue_weight: "",
  });
  const [completeForm, setCompleteForm] = useState({
    return_weight: "",
    scrap_weight: "",
  });
  const [isShaking, setIsShaking] = useState(false);

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
      const result = await getRunningMelts();
      if (result.success) setActiveMelts(result.data);
    } catch (error) {
      showToast("Failed to load active melts", "error");
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

    try {
      await startMelt(startForm.metal_type, startForm.issue_weight);
      showToast("Melting Started Successfully!", "success");
      setIsStartModalOpen(false);
      setStartForm({ metal_type: "Gold", issue_weight: "" });
      fetchMelts();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to start melt (Check Stock)", "error");
    }
  };

  // Handle Complete Melt
  const handleCompleteMelt = async (e) => {
    e.preventDefault();

    // Safety checks before submitting
    const retWeight = parseFloat(completeForm.return_weight) || 0;
    const scrWeight = parseFloat(completeForm.scrap_weight) || 0;

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
      setCompleteForm({ return_weight: "", scrap_weight: "" });
      setSelectedMelt(null);
      fetchMelts();
    } catch (error) {
      triggerError();
      showToast("Failed to complete melt", "error");
    }
  };

  const openCompleteModal = (melt) => {
    setSelectedMelt(melt);
    // Reset form when opening
    setCompleteForm({ return_weight: "", scrap_weight: "" });
    setIsCompleteModalOpen(true);
  };

  // --- REAL-TIME LOSS CALCULATION ---
  const issueW = selectedMelt ? parseFloat(selectedMelt.issue_weight) || 0 : 0;
  const returnW = parseFloat(completeForm.return_weight) || 0;
  const scrapW = parseFloat(completeForm.scrap_weight) || 0;

  // Calculate and format strictly to 3 decimals to avoid JS floating point bugs
  const liveLoss = parseFloat((issueW - (returnW + scrapW)).toFixed(3));
  const isLossNegative = liveLoss < 0;

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
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">
          Active Melts
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
                  <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 animate-pulse">
                    <Flame size={12} /> Running
                  </span>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-100">
                  <p className="text-sm text-gray-500 font-medium">
                    Issued Weight
                  </p>
                  <p className="text-2xl font-bold text-gray-800">
                    {melt.issue_weight.toFixed(3)}{" "}
                    <span className="text-base text-gray-400">
                      {melt.metal_type === "Gold" ? "g" : "kg"}
                    </span>
                  </p>
                </div>

                <button
                  onClick={() => openCompleteModal(melt)}
                  className="w-full bg-green-50 text-green-700 font-bold py-3 rounded-xl hover:bg-green-600 hover:text-white transition-colors flex justify-center items-center gap-2"
                >
                  <CheckCircle size={18} /> Complete Process
                </button>
              </div>
            ))}
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
            <input
              type="number"
              step="0.001"
              className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none focus:bg-white focus:border-orange-500 transition-colors"
              value={startForm.issue_weight}
              onChange={(e) =>
                setStartForm({ ...startForm, issue_weight: e.target.value })
              }
              placeholder="0.000"
            />
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
                Total Issued Weight:
              </span>
              <span className="text-xl font-bold text-blue-900">
                {issueW.toFixed(3)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                  placeholder="0.000"
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
                  placeholder="0.000"
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
                {liveLoss.toFixed(3)}
              </span>
            </div>
            {isLossNegative && (
              <p className="text-red-500 text-xs text-center font-bold">
                Error: Return + Scrap cannot be larger than Issued Weight!
              </p>
            )}

            <button
              type="submit"
              disabled={isLossNegative} // Disable button if math is physically impossible
              className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 shadow-md active:scale-95 transition-all flex justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle size={20} /> Save to Inventory
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default MeltingProcess;
