"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface City {
  id: string;
  name: string;
  country: string;
  x: number; // percent of SVG width (0-100)
  y: number; // percent of SVG height (0-100)
  type: "hub" | "partner" | "office";
}

const cities: City[] = [
  { id: "guangzhou", name: "Guangzhou", country: "Китай", x: 78, y: 68, type: "hub" },
  { id: "shenzhen", name: "Shenzhen", country: "Китай", x: 80, y: 72, type: "hub" },
  { id: "moscow", name: "Moscow", country: "Россия", x: 38, y: 32, type: "hub" },
  { id: "almaty", name: "Almaty", country: "Казахстан", x: 52, y: 48, type: "partner" },
  { id: "minsk", name: "Minsk", country: "Беларусь", x: 30, y: 28, type: "partner" },
  { id: "tashkent", name: "Tashkent", country: "Узбекистан", x: 56, y: 54, type: "partner" },
  { id: "shanghai", name: "Shanghai", country: "Китай", x: 82, y: 58, type: "office" },
  { id: "beijing", name: "Beijing", country: "Китай", x: 76, y: 50, type: "office" },
];

const typeStyles = {
  hub: { radius: 8, fill: "var(--color-primary)", label: "font-semibold", ring: "fill-primary/10" },
  partner: { radius: 6, fill: "var(--color-secondary)", label: "font-medium", ring: "fill-secondary/10" },
  office: { radius: 5, fill: "#9ca3af", label: "", ring: "fill-gray-400/10" },
} as const;

const links: [string, string][] = [
  ["guangzhou", "moscow"],
  ["guangzhou", "almaty"],
  ["guangzhou", "minsk"],
  ["moscow", "almaty"],
  ["moscow", "minsk"],
];

const cityById = Object.fromEntries(cities.map((city) => [city.id, city]));

function GeographyMap() {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);

  return (
    <div className="relative h-64 w-full sm:h-72">
      <svg viewBox="0 0 800 500" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="landmassGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <g stroke="rgba(79, 123, 255, 0.25)" strokeWidth="1.5" fill="url(#landmassGradient)">
          {/* Европа */}
          <path d="M240 120 L260 100 L290 95 L310 80 L330 85 L350 75 L370 80 L380 95 L390 110 L400 130 L410 145 L400 160 L380 170 L360 175 L340 185 L320 190 L300 195 L280 200 L260 195 L240 185 L230 170 L225 150 L230 135 L240 120Z" />
          {/* Азия */}
          <path d="M400 130 L430 110 L460 100 L490 95 L520 90 L550 85 L580 95 L610 100 L640 110 L670 120 L690 140 L700 160 L710 180 L715 200 L720 220 L725 240 L720 260 L710 280 L700 300 L690 320 L680 340 L660 350 L640 355 L620 360 L600 365 L580 370 L560 375 L540 380 L520 385 L500 390 L480 395 L460 400 L440 405 L420 400 L400 390 L380 380 L360 370 L340 360 L320 350 L300 340 L290 330 L285 310 L280 290 L275 270 L270 250 L265 230 L260 210 L255 190 L250 170 L240 150 L235 135 L240 120Z" />
          {/* Ближний Восток */}
          <path d="M290 330 L310 320 L330 310 L350 305 L360 315 L355 335 L340 350 L320 360 L300 355 L290 340Z" />
          {/* Юго-Восточная Азия */}
          <path d="M640 355 L660 340 L680 330 L700 340 L710 360 L700 380 L680 390 L660 395 L640 385 L630 370Z" />
        </g>

        <g stroke="rgba(79, 123, 255, 0.35)" strokeWidth="1" strokeDasharray="4 4">
          {links.map(([fromId, toId]) => {
            const from = cityById[fromId];
            const to = cityById[toId];
            return (
              <line
                key={`${fromId}-${toId}`}
                x1={(from.x / 100) * 800}
                y1={(from.y / 100) * 500}
                x2={(to.x / 100) * 800}
                y2={(to.y / 100) * 500}
              />
            );
          })}
        </g>

        {cities.map((city) => {
          const style = typeStyles[city.type];
          const isHovered = hoveredCity === city.id;
          const cx = (city.x / 100) * 800;
          const cy = (city.y / 100) * 500;
          const anchorLeft = city.x > 50;

          return (
            <g
              key={city.id}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredCity(city.id)}
              onMouseLeave={() => setHoveredCity(null)}
            >
              <circle cx={cx} cy={cy} r={12} className={cn(style.ring, isHovered && "animate-marker-pulse")} />

              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? style.radius + 2 : style.radius}
                fill={style.fill}
                className="transition-all duration-200"
              />

              <text
                x={cx + (anchorLeft ? -14 : 14)}
                y={cy - 14}
                textAnchor={anchorLeft ? "end" : "start"}
                className={cn(
                  "text-[10px] transition-opacity duration-200",
                  style.label,
                  isHovered ? "fill-text opacity-100" : "fill-text-secondary opacity-70",
                )}
              >
                {city.name}
              </text>

              {isHovered && (
                <text
                  x={cx + (anchorLeft ? -14 : 14)}
                  y={cy - 2}
                  textAnchor={anchorLeft ? "end" : "start"}
                  className="fill-text-secondary text-[9px]"
                >
                  {city.country}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="absolute bottom-2 right-2 flex flex-col gap-1.5 rounded-lg bg-surface/80 p-3 text-[11px] backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-text-secondary">Хаб</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          <span className="text-text-secondary">Партнёр</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          <span className="text-text-secondary">Офис</span>
        </div>
      </div>
    </div>
  );
}

export { GeographyMap };
