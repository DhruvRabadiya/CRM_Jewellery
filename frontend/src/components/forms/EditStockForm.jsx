import React, { useState } from "react";
import { Save, ArrowDownLeft } from "lucide-react";
import { editPurchase } from "../../api/stockService";

const EditStockForm = ({ purchase, onSuccess, onCancel, showToast }) => {
  const isSilver = purchase.metal_type === "Silver";
  
  const [formData, setFormData] = useState({
    weight: isSilver ? (purchase.weight / 1000).toString() : purchase.weight.toString(),
    weight_unit: isSilver ? "kg" : "g",
    description: purchase.description || "",
  });
  
  const [isShaking, setIsShaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.weight || parseFloat(formData.weight) <= 0) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      showToast("Invalid Weight", "error");
      return;
    }

    let finalWeight = parseFloat(formData.weight);
    if (formData.weight_unit === "kg") {
      finalWeight *= 1000;
    }

    setIsSubmitting(true);
    try {
      await editPurchase(purchase.id, {
        weight: finalWeight,
        description: formData.description
      });
      showToast("Stock Entry Updated Successfully!", "success");
      onSuccess();
    } catch (error) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      showToast(error.message || "Failed to edit stock", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
    >
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Metal Type (Locked)
        </label>
        <div className="relative">
          <input
            type="text"
            className="w-full bg-gray-100 border border-gray-200 text-gray-500 py-3 px-4 rounded-lg outline-none font-bold"
            value={purchase.metal_type}
            disabled
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Edited Weight
        </label>
        <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-blue-500 transition-colors overflow-hidden">
          <input
            type="number"
            step="0.001"
            className="w-full bg-transparent text-gray-700 py-3 px-4 outline-none font-bold"
            value={formData.weight}
            onChange={(e) =>
              setFormData({ ...formData, weight: e.target.value })
            }
            placeholder="0.000"
          />
          <select
            className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none"
            value={formData.weight_unit}
            onChange={(e) =>
              setFormData({ ...formData, weight_unit: e.target.value })
            }
          >
            <option value="g">g</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Description
        </label>
        <textarea
          className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-3 px-4 rounded-lg outline-none resize-none"
          rows="3"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
        ></textarea>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2"
      >
        <Save size={20} />{" "}
        {isSubmitting ? "Saving changes..." : "Save Edits"}
      </button>
    </form>
  );
};

export default EditStockForm;
