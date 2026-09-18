-- Seed: cursos reales migrados desde index.html (LC-COURSES)
BEGIN;

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Reparación de Celulares y Tablets', 'reparacion-de-celulares-y-tablets', 'Aprendé a diagnosticar y reparar todo tipo de celulares y tablets. Pantallas, baterías, placas y más.', 'Aprendé a diagnosticar y reparar todo tipo de celulares y tablets. Pantallas, baterías, placas y más.', '📱', 'https://images.unsplash.com/photo-1601972599720-36938d4ecd31?w=500&q=80', 'Principiante', 30, 14900, 19900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'tech'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Introducción a la reparación', 0 FROM courses WHERE slug = 'reparacion-de-celulares-y-tablets';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Herramientas profesionales', 1 FROM courses WHERE slug = 'reparacion-de-celulares-y-tablets';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Diagnóstico de fallas', 2 FROM courses WHERE slug = 'reparacion-de-celulares-y-tablets';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Reemplazo de pantallas', 3 FROM courses WHERE slug = 'reparacion-de-celulares-y-tablets';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Cambio de batería', 4 FROM courses WHERE slug = 'reparacion-de-celulares-y-tablets';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Reparación de placa', 5 FROM courses WHERE slug = 'reparacion-de-celulares-y-tablets';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Soldadura SMD básica', 6 FROM courses WHERE slug = 'reparacion-de-celulares-y-tablets';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Práctica con equipos reales', 7 FROM courses WHERE slug = 'reparacion-de-celulares-y-tablets';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Técnico de PC', 'tecnico-de-pc', 'Armado, mantenimiento y reparación de computadoras de escritorio y notebooks.', 'Armado, mantenimiento y reparación de computadoras de escritorio y notebooks.', '💻', 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=500&q=80', 'Principiante', 25, 12900, 17900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'tech'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Hardware y componentes', 0 FROM courses WHERE slug = 'tecnico-de-pc';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Armado de PC paso a paso', 1 FROM courses WHERE slug = 'tecnico-de-pc';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Instalación de SO', 2 FROM courses WHERE slug = 'tecnico-de-pc';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Mantenimiento preventivo', 3 FROM courses WHERE slug = 'tecnico-de-pc';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Diagnóstico de fallas', 4 FROM courses WHERE slug = 'tecnico-de-pc';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Reparación de notebooks', 5 FROM courses WHERE slug = 'tecnico-de-pc';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Redes básicas', 6 FROM courses WHERE slug = 'tecnico-de-pc';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Sistemas BIOS/UEFI', 7 FROM courses WHERE slug = 'tecnico-de-pc';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Reparación de PS3, PS4 y Consolas', 'reparacion-de-ps3-ps4-y-consolas', 'Repará consolas PlayStation, Xbox y más. Diagnóstico, soldadura y reemplazo de componentes.', 'Repará consolas PlayStation, Xbox y más. Diagnóstico, soldadura y reemplazo de componentes.', '🎮', 'https://images.unsplash.com/photo-1580327344181-c1163234e5a0?w=500&q=80', 'Intermedio', 22, 13900, 18900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'tech'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Arquitectura de consolas', 0 FROM courses WHERE slug = 'reparacion-de-ps3-ps4-y-consolas';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Desmontaje y limpieza', 1 FROM courses WHERE slug = 'reparacion-de-ps3-ps4-y-consolas';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Falla YLOD / RROD', 2 FROM courses WHERE slug = 'reparacion-de-ps3-ps4-y-consolas';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Soldadura BGA', 3 FROM courses WHERE slug = 'reparacion-de-ps3-ps4-y-consolas';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Lectores ópticos', 4 FROM courses WHERE slug = 'reparacion-de-ps3-ps4-y-consolas';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Disco duro y SSD', 5 FROM courses WHERE slug = 'reparacion-de-ps3-ps4-y-consolas';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Joypad y controles', 6 FROM courses WHERE slug = 'reparacion-de-ps3-ps4-y-consolas';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Casos prácticos', 7 FROM courses WHERE slug = 'reparacion-de-ps3-ps4-y-consolas';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Diseño Gráfico', 'diseno-grafico', 'Principios del diseño, tipografía, color, composición y creación de identidad visual profesional.', 'Principios del diseño, tipografía, color, composición y creación de identidad visual profesional.', '🎨', 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=500&q=80', 'Principiante', 35, 15900, 22900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'design'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Fundamentos del diseño', 0 FROM courses WHERE slug = 'diseno-grafico';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Teoría del color', 1 FROM courses WHERE slug = 'diseno-grafico';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Tipografía', 2 FROM courses WHERE slug = 'diseno-grafico';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Composición y layout', 3 FROM courses WHERE slug = 'diseno-grafico';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Identidad de marca', 4 FROM courses WHERE slug = 'diseno-grafico';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Diseño editorial', 5 FROM courses WHERE slug = 'diseno-grafico';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Mockups profesionales', 6 FROM courses WHERE slug = 'diseno-grafico';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Portfolio final', 7 FROM courses WHERE slug = 'diseno-grafico';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Canva Pro', 'canva-pro', 'Dominá Canva Pro al 100%. Redes sociales, presentaciones, infografías y más.', 'Dominá Canva Pro al 100%. Redes sociales, presentaciones, infografías y más.', '🖼️', 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=500&q=80', 'Principiante', 15, 8900, 12900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'design'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Interfaz de Canva Pro', 0 FROM courses WHERE slug = 'canva-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Plantillas premium', 1 FROM courses WHERE slug = 'canva-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Diseño para RRSS', 2 FROM courses WHERE slug = 'canva-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Presentaciones', 3 FROM courses WHERE slug = 'canva-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Infografías', 4 FROM courses WHERE slug = 'canva-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Videos con Canva', 5 FROM courses WHERE slug = 'canva-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Brand Kit', 6 FROM courses WHERE slug = 'canva-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Trucos avanzados', 7 FROM courses WHERE slug = 'canva-pro';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'CapCut Pro', 'capcut-pro', 'El editor favorito para Reels e historias. Dominá CapCut para crear contenido viral.', 'El editor favorito para Reels e historias. Dominá CapCut para crear contenido viral.', '✂️', 'https://images.unsplash.com/photo-1616763355548-1b606f439f86?w=500&q=80', 'Principiante', 12, 7900, 10900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'design'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Interfaz CapCut', 0 FROM courses WHERE slug = 'capcut-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Cortes y transiciones', 1 FROM courses WHERE slug = 'capcut-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Texto animado', 2 FROM courses WHERE slug = 'capcut-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Efectos virales', 3 FROM courses WHERE slug = 'capcut-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Autosubtítulos', 4 FROM courses WHERE slug = 'capcut-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Música y sonido', 5 FROM courses WHERE slug = 'capcut-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Reels perfectos', 6 FROM courses WHERE slug = 'capcut-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Exportar y publicar', 7 FROM courses WHERE slug = 'capcut-pro';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'ChatGPT Pro', 'chatgpt-pro', 'Usá ChatGPT como un profesional para negocios, marketing, contenido y productividad.', 'Usá ChatGPT como un profesional para negocios, marketing, contenido y productividad.', '🤖', 'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=500&q=80', 'Principiante', 20, 12900, 17900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'ai'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Qué es ChatGPT', 0 FROM courses WHERE slug = 'chatgpt-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Prompts efectivos', 1 FROM courses WHERE slug = 'chatgpt-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Casos de uso reales', 2 FROM courses WHERE slug = 'chatgpt-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'ChatGPT para marketing', 3 FROM courses WHERE slug = 'chatgpt-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Automatización de tareas', 4 FROM courses WHERE slug = 'chatgpt-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'GPT-4 y plugins', 5 FROM courses WHERE slug = 'chatgpt-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Limitaciones y ética', 6 FROM courses WHERE slug = 'chatgpt-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Proyecto final', 7 FROM courses WHERE slug = 'chatgpt-pro';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Gemini Pro', 'gemini-pro', 'Google Gemini avanzado para productividad, investigación y creación de contenido.', 'Google Gemini avanzado para productividad, investigación y creación de contenido.', '💎', NULL, 'Principiante', 15, 10900, 14900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'ai'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Introducción a Gemini', 0 FROM courses WHERE slug = 'gemini-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Gemini vs ChatGPT', 1 FROM courses WHERE slug = 'gemini-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Integración con Google', 2 FROM courses WHERE slug = 'gemini-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Multimodalidad', 3 FROM courses WHERE slug = 'gemini-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Análisis de datos', 4 FROM courses WHERE slug = 'gemini-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Automatización', 5 FROM courses WHERE slug = 'gemini-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Google Workspace + IA', 6 FROM courses WHERE slug = 'gemini-pro';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Casos prácticos', 7 FROM courses WHERE slug = 'gemini-pro';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Inteligencia Artificial Avanzada', 'inteligencia-artificial-avanzada', 'Machine Learning, redes neuronales, Python para IA y proyectos reales de AI.', 'Machine Learning, redes neuronales, Python para IA y proyectos reales de AI.', '🧠', 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=500&q=80', 'Avanzado', 50, 24900, 35900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'ai'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Python para IA', 0 FROM courses WHERE slug = 'inteligencia-artificial-avanzada';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'NumPy y Pandas', 1 FROM courses WHERE slug = 'inteligencia-artificial-avanzada';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Machine Learning', 2 FROM courses WHERE slug = 'inteligencia-artificial-avanzada';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Redes neuronales', 3 FROM courses WHERE slug = 'inteligencia-artificial-avanzada';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Deep Learning', 4 FROM courses WHERE slug = 'inteligencia-artificial-avanzada';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Computer Vision', 5 FROM courses WHERE slug = 'inteligencia-artificial-avanzada';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'NLP y LLMs', 6 FROM courses WHERE slug = 'inteligencia-artificial-avanzada';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Proyecto real de IA', 7 FROM courses WHERE slug = 'inteligencia-artificial-avanzada';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Facebook, Instagram y TikTok Ads', 'facebook-instagram-y-tiktok-ads', 'Dominá la publicidad en las 3 redes más poderosas. Campañas rentables en Meta y TikTok con segmentación avanzada y estrategias que venden.', 'Dominá la publicidad en las 3 redes más poderosas. Campañas rentables en Meta y TikTok con segmentación avanzada y estrategias que venden.', '📱', 'https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?w=500&q=80', 'Intermedio', 25, 14900, 21900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'marketing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Meta Business Suite', 0 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Estructura de campañas en Facebook', 1 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Segmentación avanzada', 2 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Creatividades que venden', 3 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Píxel de Facebook y retargeting', 4 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Anuncios en Instagram Stories y Reels', 5 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'TikTok Ads Manager', 6 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Campañas en TikTok For Business', 7 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Tendencias y contenido viral en TikTok', 8 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'A/B Testing y optimización', 9 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Análisis de métricas y ROAS', 10 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Estrategia integrada 360°', 11 FROM courses WHERE slug = 'facebook-instagram-y-tiktok-ads';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Marketing Digital Completo', 'marketing-digital-completo', 'Estrategia 360° de marketing digital: SEO, redes, email, contenido y analítica.', 'Estrategia 360° de marketing digital: SEO, redes, email, contenido y analítica.', '📣', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&q=80', 'Intermedio', 45, 19900, 28900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'marketing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Estrategia digital', 0 FROM courses WHERE slug = 'marketing-digital-completo';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'SEO técnico y on-page', 1 FROM courses WHERE slug = 'marketing-digital-completo';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Google Ads', 2 FROM courses WHERE slug = 'marketing-digital-completo';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Email marketing', 3 FROM courses WHERE slug = 'marketing-digital-completo';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Content marketing', 4 FROM courses WHERE slug = 'marketing-digital-completo';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Analytics y datos', 5 FROM courses WHERE slug = 'marketing-digital-completo';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Funnel de ventas', 6 FROM courses WHERE slug = 'marketing-digital-completo';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Plan de marketing', 7 FROM courses WHERE slug = 'marketing-digital-completo';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Community Manager', 'community-manager', 'Gestioná comunidades online, creá contenido viral y monetizá tu trabajo en redes.', 'Gestioná comunidades online, creá contenido viral y monetizá tu trabajo en redes.', '👥', NULL, 'Principiante', 20, 11900, 16900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'marketing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'El rol del CM', 0 FROM courses WHERE slug = 'community-manager';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Estrategia de contenidos', 1 FROM courses WHERE slug = 'community-manager';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Planificación editorial', 2 FROM courses WHERE slug = 'community-manager';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Diseño para RRSS', 3 FROM courses WHERE slug = 'community-manager';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Métricas y KPIs', 4 FROM courses WHERE slug = 'community-manager';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Gestión de crisis', 5 FROM courses WHERE slug = 'community-manager';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Herramientas pro', 6 FROM courses WHERE slug = 'community-manager';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Conseguir clientes', 7 FROM courses WHERE slug = 'community-manager';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Claude IA', 'claude-ia', 'Dominá Claude IA de principiante a experto. Conversaciones inteligentes, análisis, escritura profesional, código y automatización de tareas.', 'Dominá Claude IA de principiante a experto. Conversaciones inteligentes, análisis, escritura profesional, código y automatización de tareas.', '✳️', 'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=500&q=80', 'Principiante', 20, 12900, 18900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'ai'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Introducción a Claude IA', 0 FROM courses WHERE slug = 'claude-ia';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Chat inteligente y prompts avanzados', 1 FROM courses WHERE slug = 'claude-ia';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Análisis de documentos y datos', 2 FROM courses WHERE slug = 'claude-ia';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Escritura y redacción profesional', 3 FROM courses WHERE slug = 'claude-ia';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Código y programación con IA', 4 FROM courses WHERE slug = 'claude-ia';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Automatización de tareas', 5 FROM courses WHERE slug = 'claude-ia';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Generación de ideas y creatividad', 6 FROM courses WHERE slug = 'claude-ia';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Integraciones y flujos de trabajo', 7 FROM courses WHERE slug = 'claude-ia';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Claude para negocios', 8 FROM courses WHERE slug = 'claude-ia';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Proyecto final con IA', 9 FROM courses WHERE slug = 'claude-ia';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Excel Básico a Avanzado', 'excel-basico-a-avanzado', 'Desde cero hasta nivel experto. Fórmulas, tablas dinámicas, macros y Power Query.', 'Desde cero hasta nivel experto. Fórmulas, tablas dinámicas, macros y Power Query.', '📊', 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500&q=80', 'Principiante', 25, 9900, 14900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'edu'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Interfaz de Excel', 0 FROM courses WHERE slug = 'excel-basico-a-avanzado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Fórmulas y funciones', 1 FROM courses WHERE slug = 'excel-basico-a-avanzado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Tablas dinámicas', 2 FROM courses WHERE slug = 'excel-basico-a-avanzado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Gráficos avanzados', 3 FROM courses WHERE slug = 'excel-basico-a-avanzado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Base de datos en Excel', 4 FROM courses WHERE slug = 'excel-basico-a-avanzado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Macros con VBA', 5 FROM courses WHERE slug = 'excel-basico-a-avanzado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Power Query', 6 FROM courses WHERE slug = 'excel-basico-a-avanzado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Dashboard profesional', 7 FROM courses WHERE slug = 'excel-basico-a-avanzado';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Inglés Básico a Experto', 'ingles-basico-a-experto', 'Aprendé inglés de cero con método moderno. Conversación, gramática y negocios.', 'Aprendé inglés de cero con método moderno. Conversación, gramática y negocios.', '🇬🇧', 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=500&q=80', 'Principiante', 60, 18900, 27900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'edu'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Pronunciación y fonética', 0 FROM courses WHERE slug = 'ingles-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Gramática esencial', 1 FROM courses WHERE slug = 'ingles-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Vocabulario cotidiano', 2 FROM courses WHERE slug = 'ingles-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Conversación básica', 3 FROM courses WHERE slug = 'ingles-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Inglés de negocios', 4 FROM courses WHERE slug = 'ingles-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Writing profesional', 5 FROM courses WHERE slug = 'ingles-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Comprensión oral', 6 FROM courses WHERE slug = 'ingles-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Nivel C1 avanzado', 7 FROM courses WHERE slug = 'ingles-basico-a-experto';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'AutoCAD', 'autocad', 'Diseño 2D y 3D con AutoCAD. Para arquitectura, ingeniería y diseño industrial.', 'Diseño 2D y 3D con AutoCAD. Para arquitectura, ingeniería y diseño industrial.', '📐', 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=500&q=80', 'Intermedio', 30, 14900, 20900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'edu'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Interfaz AutoCAD', 0 FROM courses WHERE slug = 'autocad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Dibujo 2D básico', 1 FROM courses WHERE slug = 'autocad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Precisión y cotas', 2 FROM courses WHERE slug = 'autocad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Capas y bloques', 3 FROM courses WHERE slug = 'autocad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Diseño 3D', 4 FROM courses WHERE slug = 'autocad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Renderizado básico', 5 FROM courses WHERE slug = 'autocad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Planos profesionales', 6 FROM courses WHERE slug = 'autocad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Impresión técnica', 7 FROM courses WHERE slug = 'autocad';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Trading Básico a Experto', 'trading-basico-a-experto', 'Analizá mercados, operá acciones, criptomonedas y forex con estrategias profesionales.', 'Analizá mercados, operá acciones, criptomonedas y forex con estrategias profesionales.', '📈', 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&q=80', 'Principiante', 50, 15900, 24900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'biz'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Mercados financieros', 0 FROM courses WHERE slug = 'trading-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Análisis técnico', 1 FROM courses WHERE slug = 'trading-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Análisis fundamental', 2 FROM courses WHERE slug = 'trading-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Gestión del riesgo', 3 FROM courses WHERE slug = 'trading-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Trading de criptomonedas', 4 FROM courses WHERE slug = 'trading-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Forex', 5 FROM courses WHERE slug = 'trading-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Estrategias avanzadas', 6 FROM courses WHERE slug = 'trading-basico-a-experto';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Plan de trading', 7 FROM courses WHERE slug = 'trading-basico-a-experto';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Carpintería', 'carpinteria', 'Trabajo en madera desde cero. Herramientas, técnicas y proyectos prácticos.', 'Trabajo en madera desde cero. Herramientas, técnicas y proyectos prácticos.', '🪚', 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500&q=80', 'Principiante', 30, 11900, 16900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'trade'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Herramientas básicas', 0 FROM courses WHERE slug = 'carpinteria';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Tipos de madera', 1 FROM courses WHERE slug = 'carpinteria';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Corte y medición', 2 FROM courses WHERE slug = 'carpinteria';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Ensambles y uniones', 3 FROM courses WHERE slug = 'carpinteria';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Lijado y acabado', 4 FROM courses WHERE slug = 'carpinteria';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Barnices y pinturas', 5 FROM courses WHERE slug = 'carpinteria';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Muebles básicos', 6 FROM courses WHERE slug = 'carpinteria';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Proyecto final', 7 FROM courses WHERE slug = 'carpinteria';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Instalador de Aire Acondicionado', 'instalador-de-aire-acondicionado', 'Instalá, mantenés y reparás equipos de aire acondicionado split y central.', 'Instalá, mantenés y reparás equipos de aire acondicionado split y central.', '❄️', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80', 'Intermedio', 25, 13900, 19900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'trade'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Refrigeración básica', 0 FROM courses WHERE slug = 'instalador-de-aire-acondicionado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Tipos de equipos', 1 FROM courses WHERE slug = 'instalador-de-aire-acondicionado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Herramientas especiales', 2 FROM courses WHERE slug = 'instalador-de-aire-acondicionado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Instalación split', 3 FROM courses WHERE slug = 'instalador-de-aire-acondicionado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Carga de gas', 4 FROM courses WHERE slug = 'instalador-de-aire-acondicionado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Electricidad aplicada', 5 FROM courses WHERE slug = 'instalador-de-aire-acondicionado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Mantenimiento', 6 FROM courses WHERE slug = 'instalador-de-aire-acondicionado';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Diagnóstico de fallas', 7 FROM courses WHERE slug = 'instalador-de-aire-acondicionado';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Electricista a Domicilio', 'electricista-a-domicilio', 'Instalaciones eléctricas residenciales. Tableros, circuitos y normativas de seguridad.', 'Instalaciones eléctricas residenciales. Tableros, circuitos y normativas de seguridad.', '⚡', NULL, 'Principiante', 28, 12900, 17900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'trade'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Seguridad eléctrica', 0 FROM courses WHERE slug = 'electricista-a-domicilio';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Materiales y herramientas', 1 FROM courses WHERE slug = 'electricista-a-domicilio';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Circuitos básicos', 2 FROM courses WHERE slug = 'electricista-a-domicilio';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Tablero eléctrico', 3 FROM courses WHERE slug = 'electricista-a-domicilio';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Tomacorrientes e interruptores', 4 FROM courses WHERE slug = 'electricista-a-domicilio';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Iluminación LED', 5 FROM courses WHERE slug = 'electricista-a-domicilio';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Normativas vigentes', 6 FROM courses WHERE slug = 'electricista-a-domicilio';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Instalación completa', 7 FROM courses WHERE slug = 'electricista-a-domicilio';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Barbería Profesional', 'barberia-profesional', 'Técnicas de corte, degradado, afeitado y atención al cliente para barberos profesionales.', 'Técnicas de corte, degradado, afeitado y atención al cliente para barberos profesionales.', '💈', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&q=80', 'Principiante', 20, 10900, 15900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'trade'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Herramientas de barbería', 0 FROM courses WHERE slug = 'barberia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Higiene y esterilización', 1 FROM courses WHERE slug = 'barberia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Cortes clásicos', 2 FROM courses WHERE slug = 'barberia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Técnica de degradado', 3 FROM courses WHERE slug = 'barberia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Diseño de barba', 4 FROM courses WHERE slug = 'barberia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Afeitado con navaja', 5 FROM courses WHERE slug = 'barberia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Atención al cliente', 6 FROM courses WHERE slug = 'barberia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Emprender tu barbería', 7 FROM courses WHERE slug = 'barberia-profesional';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Fitness y Entrenamiento Personal', 'fitness-y-entrenamiento-personal', 'Entrenamiento físico desde cero. Rutinas, nutrición, técnicas y cómo ser entrenador personal.', 'Entrenamiento físico desde cero. Rutinas, nutrición, técnicas y cómo ser entrenador personal.', '💪', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=500&q=80', 'Principiante', NULL, 9900, 14900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'edu'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Anatomía básica', 0 FROM courses WHERE slug = 'fitness-y-entrenamiento-personal';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Principios del entrenamiento', 1 FROM courses WHERE slug = 'fitness-y-entrenamiento-personal';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Rutinas de fuerza', 2 FROM courses WHERE slug = 'fitness-y-entrenamiento-personal';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Cardio y resistencia', 3 FROM courses WHERE slug = 'fitness-y-entrenamiento-personal';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Nutrición deportiva', 4 FROM courses WHERE slug = 'fitness-y-entrenamiento-personal';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Suplementación', 5 FROM courses WHERE slug = 'fitness-y-entrenamiento-personal';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Entrenamiento funcional', 6 FROM courses WHERE slug = 'fitness-y-entrenamiento-personal';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Certificación personal trainer', 7 FROM courses WHERE slug = 'fitness-y-entrenamiento-personal';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Estética Vehicular — Detailing Profesional', 'estetica-vehicular-detailing-profesional', 'Detailing profesional de autos. Pulido, encerado, nano cerámica, restauración de interiores y más.', 'Detailing profesional de autos. Pulido, encerado, nano cerámica, restauración de interiores y más.', '🚗', 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=500&q=80', 'Principiante', NULL, 12900, 17900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'trade'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Introducción al detailing', 0 FROM courses WHERE slug = 'estetica-vehicular-detailing-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Lavado seguro sin rayar', 1 FROM courses WHERE slug = 'estetica-vehicular-detailing-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Descontaminación química', 2 FROM courses WHERE slug = 'estetica-vehicular-detailing-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Pulido a máquina', 3 FROM courses WHERE slug = 'estetica-vehicular-detailing-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Cera y selladores', 4 FROM courses WHERE slug = 'estetica-vehicular-detailing-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Recubrimiento cerámico', 5 FROM courses WHERE slug = 'estetica-vehicular-detailing-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Restauración de interiores', 6 FROM courses WHERE slug = 'estetica-vehicular-detailing-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Armar tu negocio', 7 FROM courses WHERE slug = 'estetica-vehicular-detailing-profesional';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Fotografía Profesional', 'fotografia-profesional', 'Desde cero hasta fotografía profesional. Manejo de cámara, iluminación, composición y edición.', 'Desde cero hasta fotografía profesional. Manejo de cámara, iluminación, composición y edición.', '📷', 'https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=500&q=80', 'Principiante', NULL, 11900, 16900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'design'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Manejo de cámara DSLR/Mirrorless', 0 FROM courses WHERE slug = 'fotografia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Exposición y triángulo fotográfico', 1 FROM courses WHERE slug = 'fotografia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Composición y encuadre', 2 FROM courses WHERE slug = 'fotografia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Iluminación natural y artificial', 3 FROM courses WHERE slug = 'fotografia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Fotografía de retratos', 4 FROM courses WHERE slug = 'fotografia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Fotografía de producto', 5 FROM courses WHERE slug = 'fotografia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Edición en Lightroom', 6 FROM courses WHERE slug = 'fotografia-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Portfolio profesional', 7 FROM courses WHERE slug = 'fotografia-profesional';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Ciberseguridad', 'ciberseguridad', 'Protegé sistemas, redes y datos. Hacking ético, pentesting y seguridad informática profesional.', 'Protegé sistemas, redes y datos. Hacking ético, pentesting y seguridad informática profesional.', '🔒', 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=500&q=80', 'Intermedio', NULL, 17900, 24900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'tech'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Fundamentos de seguridad', 0 FROM courses WHERE slug = 'ciberseguridad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Redes y protocolos', 1 FROM courses WHERE slug = 'ciberseguridad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Hacking ético', 2 FROM courses WHERE slug = 'ciberseguridad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Pentesting web', 3 FROM courses WHERE slug = 'ciberseguridad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Vulnerabilidades OWASP', 4 FROM courses WHERE slug = 'ciberseguridad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Seguridad en sistemas', 5 FROM courses WHERE slug = 'ciberseguridad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'CTF y práctica real', 6 FROM courses WHERE slug = 'ciberseguridad';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Certificación CEH', 7 FROM courses WHERE slug = 'ciberseguridad';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'DJ y Producción Musical', 'dj-y-produccion-musical', 'Aprendé a mezclar, producir beats y crear música electrónica desde cero con software profesional.', 'Aprendé a mezclar, producir beats y crear música electrónica desde cero con software profesional.', '🎧', 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=500&q=80', 'Principiante', NULL, 13900, 19900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'design'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Fundamentos del sonido', 0 FROM courses WHERE slug = 'dj-y-produccion-musical';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'DJ con Serato/Rekordbox', 1 FROM courses WHERE slug = 'dj-y-produccion-musical';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Mezcla y transiciones', 2 FROM courses WHERE slug = 'dj-y-produccion-musical';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Producción en FL Studio', 3 FROM courses WHERE slug = 'dj-y-produccion-musical';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Síntesis y samples', 4 FROM courses WHERE slug = 'dj-y-produccion-musical';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Masterización básica', 5 FROM courses WHERE slug = 'dj-y-produccion-musical';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Distribución digital', 6 FROM courses WHERE slug = 'dj-y-produccion-musical';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Conseguir gigs', 7 FROM courses WHERE slug = 'dj-y-produccion-musical';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Primeros Auxilios', 'primeros-auxilios', 'Aprendé a actuar en emergencias médicas. RCP, manejo de heridas, fracturas, quemaduras y situaciones de urgencia vital.', 'Aprendé a actuar en emergencias médicas. RCP, manejo de heridas, fracturas, quemaduras y situaciones de urgencia vital.', '🚑', 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=500&q=80', 'Principiante', 12, 7900, 11900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'edu'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Qué hacer en una emergencia', 0 FROM courses WHERE slug = 'primeros-auxilios';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'RCP en adultos y niños', 1 FROM courses WHERE slug = 'primeros-auxilios';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Uso del Desfibrilador DAE', 2 FROM courses WHERE slug = 'primeros-auxilios';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Manejo de heridas y hemorragias', 3 FROM courses WHERE slug = 'primeros-auxilios';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Fracturas y luxaciones', 4 FROM courses WHERE slug = 'primeros-auxilios';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Quemaduras y electrocución', 5 FROM courses WHERE slug = 'primeros-auxilios';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Atragantamiento y maniobra Heimlich', 6 FROM courses WHERE slug = 'primeros-auxilios';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Plan de emergencia familiar', 7 FROM courses WHERE slug = 'primeros-auxilios';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Electrónica Básica', 'electronica-basica', 'Fundamentos de electrónica desde cero. Circuitos, componentes, soldadura y armado de proyectos electrónicos.', 'Fundamentos de electrónica desde cero. Circuitos, componentes, soldadura y armado de proyectos electrónicos.', '⚡', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&q=80', 'Principiante', 20, 10900, 15900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'tech'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Corriente voltaje y resistencia', 0 FROM courses WHERE slug = 'electronica-basica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Componentes electrónicos básicos', 1 FROM courses WHERE slug = 'electronica-basica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Lectura de circuitos y esquemas', 2 FROM courses WHERE slug = 'electronica-basica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Uso del multímetro', 3 FROM courses WHERE slug = 'electronica-basica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Soldadura práctica', 4 FROM courses WHERE slug = 'electronica-basica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Introducción a Arduino', 5 FROM courses WHERE slug = 'electronica-basica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Proyectos con LED y sensores', 6 FROM courses WHERE slug = 'electronica-basica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Reparación de placas electrónicas', 7 FROM courses WHERE slug = 'electronica-basica';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Paneles Solares — Instalación Profesional', 'paneles-solares-instalacion-profesional', 'Instalá sistemas de energía solar fotovoltaica. Paneles, inversores, baterías y conexión a red eléctrica domiciliaria.', 'Instalá sistemas de energía solar fotovoltaica. Paneles, inversores, baterías y conexión a red eléctrica domiciliaria.', '☀️', 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=500&q=80', 'Intermedio', 25, 16900, 23900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'trade'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Fundamentos de energía solar', 0 FROM courses WHERE slug = 'paneles-solares-instalacion-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Tipos de paneles fotovoltaicos', 1 FROM courses WHERE slug = 'paneles-solares-instalacion-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Cálculo de consumo energético', 2 FROM courses WHERE slug = 'paneles-solares-instalacion-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Inversores y baterías', 3 FROM courses WHERE slug = 'paneles-solares-instalacion-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Instalación en techo residencial', 4 FROM courses WHERE slug = 'paneles-solares-instalacion-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Conexión a red eléctrica', 5 FROM courses WHERE slug = 'paneles-solares-instalacion-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Mantenimiento y limpieza', 6 FROM courses WHERE slug = 'paneles-solares-instalacion-profesional';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Normativa y habilitaciones ENRE', 7 FROM courses WHERE slug = 'paneles-solares-instalacion-profesional';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Música — Canto Guitarra Piano y Composición', 'musica-canto-guitarra-piano-y-composicion', 'Aprendé música desde cero. Técnica vocal, guitarra, piano, teoría musical y composición de tus propias canciones.', 'Aprendé música desde cero. Técnica vocal, guitarra, piano, teoría musical y composición de tus propias canciones.', '🎵', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&q=80', 'Principiante', 30, 12900, 18900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'design'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Teoría musical básica', 0 FROM courses WHERE slug = 'musica-canto-guitarra-piano-y-composicion';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Técnica vocal y canto', 1 FROM courses WHERE slug = 'musica-canto-guitarra-piano-y-composicion';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Guitarra acústica desde cero', 2 FROM courses WHERE slug = 'musica-canto-guitarra-piano-y-composicion';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Acordes y melodías en guitarra', 3 FROM courses WHERE slug = 'musica-canto-guitarra-piano-y-composicion';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Piano y teclado básico', 4 FROM courses WHERE slug = 'musica-canto-guitarra-piano-y-composicion';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Lectura de partituras', 5 FROM courses WHERE slug = 'musica-canto-guitarra-piano-y-composicion';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Composición musical propia', 6 FROM courses WHERE slug = 'musica-canto-guitarra-piano-y-composicion';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Grabación casera de canciones', 7 FROM courses WHERE slug = 'musica-canto-guitarra-piano-y-composicion';

INSERT INTO courses (category_id, title, slug, description, short_desc, icon, thumbnail_url, level, duration_hours, price, original_price, is_published, has_certificate, lifetime_access)
SELECT id, 'Belleza — Maquillaje Peluquería y Estética', 'belleza-maquillaje-peluqueria-y-estetica', 'Todo el mundo de la belleza profesional. Maquillaje artístico, peluquería, peinados, pestañas, uñas acrílicas y más.', 'Todo el mundo de la belleza profesional. Maquillaje artístico, peluquería, peinados, pestañas, uñas acrílicas y más.', '💄', 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=500&q=80', 'Principiante', 28, 14900, 21900, TRUE, TRUE, TRUE
FROM categories WHERE slug = 'trade'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Maquillaje básico y corrección facial', 0 FROM courses WHERE slug = 'belleza-maquillaje-peluqueria-y-estetica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Maquillaje artístico y fantasía', 1 FROM courses WHERE slug = 'belleza-maquillaje-peluqueria-y-estetica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Peluquería y técnicas de corte', 2 FROM courses WHERE slug = 'belleza-maquillaje-peluqueria-y-estetica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Peinados y recogidos profesionales', 3 FROM courses WHERE slug = 'belleza-maquillaje-peluqueria-y-estetica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Extensiones y lifting de pestañas', 4 FROM courses WHERE slug = 'belleza-maquillaje-peluqueria-y-estetica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Uñas acrílicas y gel UV', 5 FROM courses WHERE slug = 'belleza-maquillaje-peluqueria-y-estetica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Colorimetría y tendencias', 6 FROM courses WHERE slug = 'belleza-maquillaje-peluqueria-y-estetica';
INSERT INTO course_syllabus (course_id, item, sort_order) SELECT id, 'Armá tu propio negocio de belleza', 7 FROM courses WHERE slug = 'belleza-maquillaje-peluqueria-y-estetica';

COMMIT;
