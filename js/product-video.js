/**
 * Product Video Handler
 * Handles hover videos and video thumbnails for product pages
 */
(function() {
    'use strict';

    const TRANSITION_DURATION = 300; // ms

    /**
     * Initialize hover video for main product image
     */
    function initHoverVideo() {
        const mainImageContainer = document.querySelector('.main-image');
        if (!mainImageContainer) return;

        const mainImg = mainImageContainer.querySelector('img');
        if (!mainImg) return;

        let videoElement = null;
        let isHovering = false;
        let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        let tapCount = 0;

        // Create or get video element (lazy loaded). Uses current main image data-hover-video (variant-aware).
        function createVideoElement() {
            const hoverVideoUrl = mainImg.dataset.hoverVideo;
            if (!hoverVideoUrl) return null;
            if (videoElement) {
                var currentSrc = (videoElement.src || '').split('?')[0];
                var newSrc = (hoverVideoUrl || '').split('?')[0];
                if (currentSrc !== newSrc) videoElement.src = hoverVideoUrl;
                return videoElement;
            }
            videoElement = document.createElement('video');
            videoElement.src = hoverVideoUrl;
            videoElement.muted = true;
            videoElement.loop = true;
            videoElement.playsInline = true;
            videoElement.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                opacity: 0;
                transition: opacity ${TRANSITION_DURATION}ms ease;
                pointer-events: none;
            `;
            mainImageContainer.style.position = 'relative';
            mainImageContainer.appendChild(videoElement);
            return videoElement;
        }

        // Show video (uses current variant's hover video from main image data-hover-video)
        function showVideo() {
            if (isHovering) return;
            if (!mainImg.dataset.hoverVideo) return;
            isHovering = true;
            const vid = createVideoElement();
            if (!vid) return;
            vid.style.opacity = '1';
            vid.currentTime = 0;
            vid.play().catch(e => console.warn('Video play failed:', e));
        }

        // Hide video
        function hideVideo() {
            if (!isHovering) return;
            isHovering = false;
            if (videoElement) {
                videoElement.style.opacity = '0';
                setTimeout(() => {
                    if (videoElement && !isHovering) {
                        videoElement.pause();
                    }
                }, TRANSITION_DURATION);
            }
        }

        // Desktop: hover events
        if (!isMobile) {
            mainImageContainer.addEventListener('mouseenter', showVideo);
            mainImageContainer.addEventListener('mouseleave', hideVideo);
        } else {
            // Mobile: tap to show video, second tap for fullscreen
            mainImageContainer.addEventListener('click', function(e) {
                e.preventDefault();
                tapCount++;
                
                if (tapCount === 1) {
                    // First tap: show video
                    showVideo();
                    setTimeout(() => {
                        if (tapCount === 1) {
                            tapCount = 0;
                            hideVideo();
                        }
                    }, 3000);
                } else if (tapCount === 2) {
                    // Second tap: fullscreen
                    tapCount = 0;
                    const vid = createVideoElement();
                    if (vid.requestFullscreen) {
                        vid.requestFullscreen();
                    } else if (vid.webkitRequestFullscreen) {
                        vid.webkitRequestFullscreen();
                    } else if (vid.mozRequestFullScreen) {
                        vid.mozRequestFullScreen();
                    }
                }
            });
        }
    }

    /**
     * Initialize video thumbnails
     */
    function initVideoThumbnails() {
        const thumbnails = document.querySelectorAll('.thumbnails img[data-type="video"]');
        thumbnails.forEach(thumb => {
            // Add play icon overlay
            if (!thumb.parentElement.querySelector('.video-play-icon')) {
                const playIcon = document.createElement('div');
                playIcon.className = 'video-play-icon';
                playIcon.innerHTML = '▶';
                playIcon.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 24px;
                    height: 24px;
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    pointer-events: none;
                    z-index: 2;
                `;
                thumb.parentElement.style.position = 'relative';
                thumb.parentElement.appendChild(playIcon);
            }

            // Handle click to show video in main area
            thumb.addEventListener('click', function() {
                const videoUrl = this.dataset.videoUrl || this.src;
                showVideoInMainArea(videoUrl);
            });
        });
    }

    /**
     * Show video in main media area
     */
    function showVideoInMainArea(videoUrl) {
        const mainImageContainer = document.querySelector('.main-image');
        if (!mainImageContainer) return;

        // Remove existing video if any
        const existingVideo = mainImageContainer.querySelector('video.main-video');
        if (existingVideo) {
            existingVideo.remove();
        }

        // Hide image temporarily
        const mainImg = mainImageContainer.querySelector('img');
        if (mainImg) {
            mainImg.style.display = 'none';
        }

        // Create and show video
        const video = document.createElement('video');
        video.className = 'main-video';
        video.src = videoUrl;
        video.controls = true;
        video.style.cssText = `
            width: 100%;
            aspect-ratio: 3/4;
            object-fit: cover;
            border: 1px solid var(--color-border);
        `;
        mainImageContainer.appendChild(video);
        video.play().catch(e => console.warn('Video play failed:', e));

        // When video ends or is paused, show image again
        video.addEventListener('ended', function() {
            if (mainImg) mainImg.style.display = '';
            video.remove();
        });

        // Update active thumbnail
        document.querySelectorAll('.thumbnails img').forEach(t => t.classList.remove('active'));
        const clickedThumb = Array.from(document.querySelectorAll('.thumbnails img')).find(t => 
            (t.dataset.videoUrl || t.src) === videoUrl
        );
        if (clickedThumb) clickedThumb.classList.add('active');
    }

    function init() {
        initHoverVideo();
        initVideoThumbnails();
    }

    window.initProductHoverVideo = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
