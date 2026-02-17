"use client";

import Link from "next/link";
import { Ward } from "@/app/types";

interface WardCardProps {
  ward: Ward;
  href?: string;
}

export default function WardCard({ ward, href }: WardCardProps) {
  const occupancyRate = Math.round(
    ((ward.totalBeds - ward.availableBeds) / ward.totalBeds) * 100,
  );

  const wardHref = href || `/wards/${ward.wardId || ward.id}`;

  return (
    <Link
      href={wardHref}
      className="block bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-blue-500"
    >
      <h2 className="text-xl font-bold text-gray-800 mb-4">{ward.name}</h2>

      <div className="flex w-full gap-4 mb-4">
        <div className="bg-green-50 flex items-center justify-center gap-3 w-full p-3 rounded">
          <p className="text-lg text-gray-600">Available</p>
          <p className="text-2xl font-bold text-green-600">
            {ward.availableBeds}
          </p>
        </div>
        <div className="bg-blue-50 items-center justify-center gap-3 flex w-full p-3 rounded">
          <p className="text-lg text-gray-600">Occupied</p>
          <p className="text-2xl font-bold text-blue-600">
            {ward.occupiedBeds}
          </p>
        </div>
        <div className="bg-yellow-50 items-center gap-3 justify-center flex w-full p-3 rounded">
          <p className="text-lg text-gray-600">Maintenance</p>
          <p className="text-2xl font-bold text-yellow-600">
            {ward.maintenanceBeds}
          </p>
        </div>
        <div className="bg-purple-50 items-center gap-3 justify-center flex w-full p-3 rounded">
          <p className="text-lg text-gray-600">In Queue</p>
          <p className="text-2xl font-bold text-purple-600">
            {ward.patientQueue.length}
          </p>
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all"
          style={{ width: `${occupancyRate}%` }}
        ></div>
      </div>
      <p className="text-sm text-gray-600 mb-4">Occupancy: {occupancyRate}%</p>
    </Link>
  );
}
