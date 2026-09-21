"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

type SparklesProps = {
  background?: string;
  particleColor?: string;
  particleDensity?: number;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  className?: string;
};

type Particle = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  opacityDirection: number;
  opacitySpeed: number;
  driftX: number;
  driftY: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function Sparkles({
  background = "transparent",
  particleColor = "#a3e635",
  particleDensity = 58,
  minSize = 0.5,
  maxSize = 1.8,
  speed = 1,
  className,
}: SparklesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const currentCanvas = canvasRef.current;
    const canvasParent = currentCanvas?.parentElement;
    if (!currentCanvas || !canvasParent) return;
    const canvas: HTMLCanvasElement = currentCanvas;
    const container: HTMLElement = canvasParent;

    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) return;
    const context: CanvasRenderingContext2D = canvasContext;

    let frameId = 0;
    let width = 0;
    let height = 0;
    let visible = false;
    let tabVisible = document.visibilityState === "visible";
    let particles: Particle[] = [];
    let previousTime = performance.now();

    const safeDensity = clamp(Math.round(particleDensity), 1, 100);
    const safeMinSize = Math.max(0.2, Math.min(minSize, maxSize));
    const safeMaxSize = Math.max(safeMinSize, maxSize);
    const safeSpeed = clamp(speed, 0.1, 3);

    function makeParticle(): Particle {
      const angle = Math.random() * Math.PI * 2;
      const velocity = (0.035 + Math.random() * 0.055) * safeSpeed;

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        size: safeMinSize + Math.random() * (safeMaxSize - safeMinSize),
        opacity: 0.12 + Math.random() * 0.7,
        opacityDirection: Math.random() > 0.5 ? 1 : -1,
        opacitySpeed: (0.00018 + Math.random() * 0.0003) * safeSpeed,
        driftX: Math.cos(angle) * velocity,
        driftY: Math.sin(angle) * velocity,
      };
    }

    function draw() {
      context.clearRect(0, 0, width, height);
      context.fillStyle = particleColor;

      for (const particle of particles) {
        context.globalAlpha = particle.opacity;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }

      context.globalAlpha = 1;
    }

    function animate(time: number) {
      if (!visible || !tabVisible || reducedMotion) return;

      const delta = Math.min(time - previousTime, 32);
      previousTime = time;

      for (const particle of particles) {
        particle.x += particle.driftX * delta;
        particle.y += particle.driftY * delta;
        particle.opacity += particle.opacityDirection * particle.opacitySpeed * delta;

        if (particle.opacity >= 0.9 || particle.opacity <= 0.08) {
          particle.opacity = clamp(particle.opacity, 0.08, 0.9);
          particle.opacityDirection *= -1;
        }
        if (particle.x < -particle.size) particle.x = width + particle.size;
        if (particle.x > width + particle.size) particle.x = -particle.size;
        if (particle.y < -particle.size) particle.y = height + particle.size;
        if (particle.y > height + particle.size) particle.y = -particle.size;
      }

      draw();
      frameId = requestAnimationFrame(animate);
    }

    function start() {
      cancelAnimationFrame(frameId);
      if (!visible || !tabVisible || reducedMotion) {
        draw();
        return;
      }
      previousTime = performance.now();
      frameId = requestAnimationFrame(animate);
    }

    function resize() {
      const rect = container.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particles = Array.from({ length: safeDensity }, makeParticle);
      draw();
    }

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    const resizeObserver = new ResizeObserver(resize);
    const handleVisibility = () => {
      tabVisible = document.visibilityState === "visible";
      start();
    };

    resize();
    intersectionObserver.observe(container);
    resizeObserver.observe(container);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(frameId);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [maxSize, minSize, particleColor, particleDensity, reducedMotion, speed]);

  return (
    <div aria-hidden="true" className={cn("pointer-events-none overflow-hidden", className)} style={{ background }}>
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
