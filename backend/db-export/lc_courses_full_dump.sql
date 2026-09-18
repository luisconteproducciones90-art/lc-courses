--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    slug character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(10),
    sort_order integer DEFAULT 0
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    course_id uuid NOT NULL,
    cert_number character varying(30) NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    pdf_url text,
    qr_code_url text
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    discount_pct integer NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coupons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coupons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coupons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coupons_id_seq OWNED BY public.coupons.id;


--
-- Name: course_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_materials (
    id integer NOT NULL,
    course_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    file_key text NOT NULL,
    file_type character varying(20),
    file_size bigint
);


--
-- Name: course_materials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_materials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_materials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_materials_id_seq OWNED BY public.course_materials.id;


--
-- Name: course_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_modules (
    id integer NOT NULL,
    course_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: course_modules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_modules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_modules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_modules_id_seq OWNED BY public.course_modules.id;


--
-- Name: course_syllabus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_syllabus (
    id integer NOT NULL,
    course_id uuid NOT NULL,
    item text NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: course_syllabus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_syllabus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_syllabus_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_syllabus_id_seq OWNED BY public.course_syllabus.id;


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    category_id integer,
    title character varying(200) NOT NULL,
    slug character varying(200) NOT NULL,
    description text,
    short_desc character varying(300),
    icon character varying(10),
    thumbnail_url text,
    intro_video_url text,
    level character varying(20) DEFAULT 'Principiante'::character varying NOT NULL,
    duration_hours numeric(5,1),
    price integer NOT NULL,
    original_price integer,
    is_published boolean DEFAULT false NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    has_certificate boolean DEFAULT true NOT NULL,
    lifetime_access boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    course_id uuid NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: lesson_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_progress (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    lesson_id integer NOT NULL,
    course_id uuid NOT NULL,
    is_completed boolean DEFAULT false NOT NULL,
    watch_seconds integer DEFAULT 0,
    completed_at timestamp with time zone
);


--
-- Name: lesson_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lesson_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lesson_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lesson_progress_id_seq OWNED BY public.lesson_progress.id;


--
-- Name: lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lessons (
    id integer NOT NULL,
    module_id integer NOT NULL,
    course_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    video_key text,
    video_url text,
    duration_secs integer,
    sort_order integer DEFAULT 0,
    is_preview boolean DEFAULT false NOT NULL
);


--
-- Name: lessons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lessons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lessons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lessons_id_seq OWNED BY public.lessons.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id uuid NOT NULL,
    course_id uuid NOT NULL,
    title text NOT NULL,
    price integer NOT NULL
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    subtotal integer NOT NULL,
    discount_amount integer DEFAULT 0 NOT NULL,
    total integer NOT NULL,
    coupon_code character varying(50),
    payment_method character varying(50),
    mp_preference_id text,
    mp_payment_id text,
    mp_status text,
    mp_status_detail text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255),
    google_id character varying(100),
    avatar_url text,
    role character varying(20) DEFAULT 'student'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    reset_token character varying(255),
    reset_expires timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: coupons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons ALTER COLUMN id SET DEFAULT nextval('public.coupons_id_seq'::regclass);


--
-- Name: course_materials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials ALTER COLUMN id SET DEFAULT nextval('public.course_materials_id_seq'::regclass);


--
-- Name: course_modules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_modules ALTER COLUMN id SET DEFAULT nextval('public.course_modules_id_seq'::regclass);


--
-- Name: course_syllabus id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_syllabus ALTER COLUMN id SET DEFAULT nextval('public.course_syllabus_id_seq'::regclass);


--
-- Name: lesson_progress id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress ALTER COLUMN id SET DEFAULT nextval('public.lesson_progress_id_seq'::regclass);


--
-- Name: lessons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons ALTER COLUMN id SET DEFAULT nextval('public.lessons_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, slug, name, icon, sort_order) FROM stdin;
1	tech	Tecnología y Reparación	🔧	1
2	design	Diseño y Edición	🎨	2
3	ai	Inteligencia Artificial	🤖	3
4	marketing	Marketing y Ventas	📢	4
5	edu	Educación Profesional	📚	5
6	biz	Negocios e Inversiones	💰	6
7	trade	Oficios	🛠	7
\.


--
-- Data for Name: certificates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.certificates (id, user_id, course_id, cert_number, issued_at, pdf_url, qr_code_url) FROM stdin;
\.


--
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.coupons (id, code, discount_pct, max_uses, used_count, valid_from, valid_until, is_active, created_at) FROM stdin;
1	BIENVENIDO20	20	100	0	2026-09-18 19:28:55.488972+00	\N	t	2026-09-18 19:28:55.488972+00
2	LCCOURSES10	10	\N	0	2026-09-18 19:28:55.488972+00	\N	t	2026-09-18 19:28:55.488972+00
\.


--
-- Data for Name: course_materials; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.course_materials (id, course_id, title, file_key, file_type, file_size) FROM stdin;
\.


--
-- Data for Name: course_modules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.course_modules (id, course_id, title, sort_order) FROM stdin;
\.


--
-- Data for Name: course_syllabus; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.course_syllabus (id, course_id, item, sort_order) FROM stdin;
1	df0eac2a-b34a-43ad-a28a-c32f96c98168	Introducción a la reparación	0
2	df0eac2a-b34a-43ad-a28a-c32f96c98168	Herramientas profesionales	1
3	df0eac2a-b34a-43ad-a28a-c32f96c98168	Diagnóstico de fallas	2
4	df0eac2a-b34a-43ad-a28a-c32f96c98168	Reemplazo de pantallas	3
5	df0eac2a-b34a-43ad-a28a-c32f96c98168	Cambio de batería	4
6	df0eac2a-b34a-43ad-a28a-c32f96c98168	Reparación de placa	5
7	df0eac2a-b34a-43ad-a28a-c32f96c98168	Soldadura SMD básica	6
8	df0eac2a-b34a-43ad-a28a-c32f96c98168	Práctica con equipos reales	7
9	2a0102a5-ef37-4cdc-9f7f-4ebfd4f9d4c3	Hardware y componentes	0
10	2a0102a5-ef37-4cdc-9f7f-4ebfd4f9d4c3	Armado de PC paso a paso	1
11	2a0102a5-ef37-4cdc-9f7f-4ebfd4f9d4c3	Instalación de SO	2
12	2a0102a5-ef37-4cdc-9f7f-4ebfd4f9d4c3	Mantenimiento preventivo	3
13	2a0102a5-ef37-4cdc-9f7f-4ebfd4f9d4c3	Diagnóstico de fallas	4
14	2a0102a5-ef37-4cdc-9f7f-4ebfd4f9d4c3	Reparación de notebooks	5
15	2a0102a5-ef37-4cdc-9f7f-4ebfd4f9d4c3	Redes básicas	6
16	2a0102a5-ef37-4cdc-9f7f-4ebfd4f9d4c3	Sistemas BIOS/UEFI	7
17	6621ce4b-8675-4462-94b8-8ced27c2a762	Arquitectura de consolas	0
18	6621ce4b-8675-4462-94b8-8ced27c2a762	Desmontaje y limpieza	1
19	6621ce4b-8675-4462-94b8-8ced27c2a762	Falla YLOD / RROD	2
20	6621ce4b-8675-4462-94b8-8ced27c2a762	Soldadura BGA	3
21	6621ce4b-8675-4462-94b8-8ced27c2a762	Lectores ópticos	4
22	6621ce4b-8675-4462-94b8-8ced27c2a762	Disco duro y SSD	5
23	6621ce4b-8675-4462-94b8-8ced27c2a762	Joypad y controles	6
24	6621ce4b-8675-4462-94b8-8ced27c2a762	Casos prácticos	7
25	553a3371-5292-40fd-b01e-d3f0916106ea	Fundamentos del diseño	0
26	553a3371-5292-40fd-b01e-d3f0916106ea	Teoría del color	1
27	553a3371-5292-40fd-b01e-d3f0916106ea	Tipografía	2
28	553a3371-5292-40fd-b01e-d3f0916106ea	Composición y layout	3
29	553a3371-5292-40fd-b01e-d3f0916106ea	Identidad de marca	4
30	553a3371-5292-40fd-b01e-d3f0916106ea	Diseño editorial	5
31	553a3371-5292-40fd-b01e-d3f0916106ea	Mockups profesionales	6
32	553a3371-5292-40fd-b01e-d3f0916106ea	Portfolio final	7
33	61df0303-2cac-4fcf-8ceb-25ad5e504304	Interfaz de Canva Pro	0
34	61df0303-2cac-4fcf-8ceb-25ad5e504304	Plantillas premium	1
35	61df0303-2cac-4fcf-8ceb-25ad5e504304	Diseño para RRSS	2
36	61df0303-2cac-4fcf-8ceb-25ad5e504304	Presentaciones	3
37	61df0303-2cac-4fcf-8ceb-25ad5e504304	Infografías	4
38	61df0303-2cac-4fcf-8ceb-25ad5e504304	Videos con Canva	5
39	61df0303-2cac-4fcf-8ceb-25ad5e504304	Brand Kit	6
40	61df0303-2cac-4fcf-8ceb-25ad5e504304	Trucos avanzados	7
41	bb638c3a-bc21-45e6-bfe8-f3b51e3eeb0f	Interfaz CapCut	0
42	bb638c3a-bc21-45e6-bfe8-f3b51e3eeb0f	Cortes y transiciones	1
43	bb638c3a-bc21-45e6-bfe8-f3b51e3eeb0f	Texto animado	2
44	bb638c3a-bc21-45e6-bfe8-f3b51e3eeb0f	Efectos virales	3
45	bb638c3a-bc21-45e6-bfe8-f3b51e3eeb0f	Autosubtítulos	4
46	bb638c3a-bc21-45e6-bfe8-f3b51e3eeb0f	Música y sonido	5
47	bb638c3a-bc21-45e6-bfe8-f3b51e3eeb0f	Reels perfectos	6
48	bb638c3a-bc21-45e6-bfe8-f3b51e3eeb0f	Exportar y publicar	7
49	d81ae57f-353e-49ce-a50e-2ead77add23a	Qué es ChatGPT	0
50	d81ae57f-353e-49ce-a50e-2ead77add23a	Prompts efectivos	1
51	d81ae57f-353e-49ce-a50e-2ead77add23a	Casos de uso reales	2
52	d81ae57f-353e-49ce-a50e-2ead77add23a	ChatGPT para marketing	3
53	d81ae57f-353e-49ce-a50e-2ead77add23a	Automatización de tareas	4
54	d81ae57f-353e-49ce-a50e-2ead77add23a	GPT-4 y plugins	5
55	d81ae57f-353e-49ce-a50e-2ead77add23a	Limitaciones y ética	6
56	d81ae57f-353e-49ce-a50e-2ead77add23a	Proyecto final	7
57	7442c17d-c360-433b-b776-f8215d858345	Introducción a Gemini	0
58	7442c17d-c360-433b-b776-f8215d858345	Gemini vs ChatGPT	1
59	7442c17d-c360-433b-b776-f8215d858345	Integración con Google	2
60	7442c17d-c360-433b-b776-f8215d858345	Multimodalidad	3
61	7442c17d-c360-433b-b776-f8215d858345	Análisis de datos	4
62	7442c17d-c360-433b-b776-f8215d858345	Automatización	5
63	7442c17d-c360-433b-b776-f8215d858345	Google Workspace + IA	6
64	7442c17d-c360-433b-b776-f8215d858345	Casos prácticos	7
65	1216d2a9-079f-4f87-a3b0-7402357c0f68	Python para IA	0
66	1216d2a9-079f-4f87-a3b0-7402357c0f68	NumPy y Pandas	1
67	1216d2a9-079f-4f87-a3b0-7402357c0f68	Machine Learning	2
68	1216d2a9-079f-4f87-a3b0-7402357c0f68	Redes neuronales	3
69	1216d2a9-079f-4f87-a3b0-7402357c0f68	Deep Learning	4
70	1216d2a9-079f-4f87-a3b0-7402357c0f68	Computer Vision	5
71	1216d2a9-079f-4f87-a3b0-7402357c0f68	NLP y LLMs	6
72	1216d2a9-079f-4f87-a3b0-7402357c0f68	Proyecto real de IA	7
73	bff16f1d-5da4-493a-955d-bcdce386b519	Meta Business Suite	0
74	bff16f1d-5da4-493a-955d-bcdce386b519	Estructura de campañas en Facebook	1
75	bff16f1d-5da4-493a-955d-bcdce386b519	Segmentación avanzada	2
76	bff16f1d-5da4-493a-955d-bcdce386b519	Creatividades que venden	3
77	bff16f1d-5da4-493a-955d-bcdce386b519	Píxel de Facebook y retargeting	4
78	bff16f1d-5da4-493a-955d-bcdce386b519	Anuncios en Instagram Stories y Reels	5
79	bff16f1d-5da4-493a-955d-bcdce386b519	TikTok Ads Manager	6
80	bff16f1d-5da4-493a-955d-bcdce386b519	Campañas en TikTok For Business	7
81	bff16f1d-5da4-493a-955d-bcdce386b519	Tendencias y contenido viral en TikTok	8
82	bff16f1d-5da4-493a-955d-bcdce386b519	A/B Testing y optimización	9
83	bff16f1d-5da4-493a-955d-bcdce386b519	Análisis de métricas y ROAS	10
84	bff16f1d-5da4-493a-955d-bcdce386b519	Estrategia integrada 360°	11
85	9957bf2c-ff03-4161-a800-c807b60c791b	Estrategia digital	0
86	9957bf2c-ff03-4161-a800-c807b60c791b	SEO técnico y on-page	1
87	9957bf2c-ff03-4161-a800-c807b60c791b	Google Ads	2
88	9957bf2c-ff03-4161-a800-c807b60c791b	Email marketing	3
89	9957bf2c-ff03-4161-a800-c807b60c791b	Content marketing	4
90	9957bf2c-ff03-4161-a800-c807b60c791b	Analytics y datos	5
91	9957bf2c-ff03-4161-a800-c807b60c791b	Funnel de ventas	6
92	9957bf2c-ff03-4161-a800-c807b60c791b	Plan de marketing	7
93	3f5c354d-0150-479b-9954-b0f80f6b669e	El rol del CM	0
94	3f5c354d-0150-479b-9954-b0f80f6b669e	Estrategia de contenidos	1
95	3f5c354d-0150-479b-9954-b0f80f6b669e	Planificación editorial	2
96	3f5c354d-0150-479b-9954-b0f80f6b669e	Diseño para RRSS	3
97	3f5c354d-0150-479b-9954-b0f80f6b669e	Métricas y KPIs	4
98	3f5c354d-0150-479b-9954-b0f80f6b669e	Gestión de crisis	5
99	3f5c354d-0150-479b-9954-b0f80f6b669e	Herramientas pro	6
100	3f5c354d-0150-479b-9954-b0f80f6b669e	Conseguir clientes	7
101	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Introducción a Claude IA	0
102	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Chat inteligente y prompts avanzados	1
103	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Análisis de documentos y datos	2
104	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Escritura y redacción profesional	3
105	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Código y programación con IA	4
106	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Automatización de tareas	5
107	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Generación de ideas y creatividad	6
108	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Integraciones y flujos de trabajo	7
109	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Claude para negocios	8
110	bc61301d-2e6d-4dbf-a8f5-f5d79512d574	Proyecto final con IA	9
111	8727f0c7-dedf-4584-bd96-f81a51974487	Interfaz de Excel	0
112	8727f0c7-dedf-4584-bd96-f81a51974487	Fórmulas y funciones	1
113	8727f0c7-dedf-4584-bd96-f81a51974487	Tablas dinámicas	2
114	8727f0c7-dedf-4584-bd96-f81a51974487	Gráficos avanzados	3
115	8727f0c7-dedf-4584-bd96-f81a51974487	Base de datos en Excel	4
116	8727f0c7-dedf-4584-bd96-f81a51974487	Macros con VBA	5
117	8727f0c7-dedf-4584-bd96-f81a51974487	Power Query	6
118	8727f0c7-dedf-4584-bd96-f81a51974487	Dashboard profesional	7
119	00044bb7-b612-449f-a38a-5b738b4d8971	Pronunciación y fonética	0
120	00044bb7-b612-449f-a38a-5b738b4d8971	Gramática esencial	1
121	00044bb7-b612-449f-a38a-5b738b4d8971	Vocabulario cotidiano	2
122	00044bb7-b612-449f-a38a-5b738b4d8971	Conversación básica	3
123	00044bb7-b612-449f-a38a-5b738b4d8971	Inglés de negocios	4
124	00044bb7-b612-449f-a38a-5b738b4d8971	Writing profesional	5
125	00044bb7-b612-449f-a38a-5b738b4d8971	Comprensión oral	6
126	00044bb7-b612-449f-a38a-5b738b4d8971	Nivel C1 avanzado	7
127	d68da288-730e-4466-8566-f63ad1a221ec	Interfaz AutoCAD	0
128	d68da288-730e-4466-8566-f63ad1a221ec	Dibujo 2D básico	1
129	d68da288-730e-4466-8566-f63ad1a221ec	Precisión y cotas	2
130	d68da288-730e-4466-8566-f63ad1a221ec	Capas y bloques	3
131	d68da288-730e-4466-8566-f63ad1a221ec	Diseño 3D	4
132	d68da288-730e-4466-8566-f63ad1a221ec	Renderizado básico	5
133	d68da288-730e-4466-8566-f63ad1a221ec	Planos profesionales	6
134	d68da288-730e-4466-8566-f63ad1a221ec	Impresión técnica	7
135	626a4b73-051a-4d46-9d94-0063467eb428	Mercados financieros	0
136	626a4b73-051a-4d46-9d94-0063467eb428	Análisis técnico	1
137	626a4b73-051a-4d46-9d94-0063467eb428	Análisis fundamental	2
138	626a4b73-051a-4d46-9d94-0063467eb428	Gestión del riesgo	3
139	626a4b73-051a-4d46-9d94-0063467eb428	Trading de criptomonedas	4
140	626a4b73-051a-4d46-9d94-0063467eb428	Forex	5
141	626a4b73-051a-4d46-9d94-0063467eb428	Estrategias avanzadas	6
142	626a4b73-051a-4d46-9d94-0063467eb428	Plan de trading	7
143	453a959e-295d-46cd-b573-549183c81480	Herramientas básicas	0
144	453a959e-295d-46cd-b573-549183c81480	Tipos de madera	1
145	453a959e-295d-46cd-b573-549183c81480	Corte y medición	2
146	453a959e-295d-46cd-b573-549183c81480	Ensambles y uniones	3
147	453a959e-295d-46cd-b573-549183c81480	Lijado y acabado	4
148	453a959e-295d-46cd-b573-549183c81480	Barnices y pinturas	5
149	453a959e-295d-46cd-b573-549183c81480	Muebles básicos	6
150	453a959e-295d-46cd-b573-549183c81480	Proyecto final	7
151	89b0fb58-e230-46e6-9278-52dffddbbbaa	Refrigeración básica	0
152	89b0fb58-e230-46e6-9278-52dffddbbbaa	Tipos de equipos	1
153	89b0fb58-e230-46e6-9278-52dffddbbbaa	Herramientas especiales	2
154	89b0fb58-e230-46e6-9278-52dffddbbbaa	Instalación split	3
155	89b0fb58-e230-46e6-9278-52dffddbbbaa	Carga de gas	4
156	89b0fb58-e230-46e6-9278-52dffddbbbaa	Electricidad aplicada	5
157	89b0fb58-e230-46e6-9278-52dffddbbbaa	Mantenimiento	6
158	89b0fb58-e230-46e6-9278-52dffddbbbaa	Diagnóstico de fallas	7
159	f3747f1d-b7ae-4a20-87b2-1c10f6e63a05	Seguridad eléctrica	0
160	f3747f1d-b7ae-4a20-87b2-1c10f6e63a05	Materiales y herramientas	1
161	f3747f1d-b7ae-4a20-87b2-1c10f6e63a05	Circuitos básicos	2
162	f3747f1d-b7ae-4a20-87b2-1c10f6e63a05	Tablero eléctrico	3
163	f3747f1d-b7ae-4a20-87b2-1c10f6e63a05	Tomacorrientes e interruptores	4
164	f3747f1d-b7ae-4a20-87b2-1c10f6e63a05	Iluminación LED	5
165	f3747f1d-b7ae-4a20-87b2-1c10f6e63a05	Normativas vigentes	6
166	f3747f1d-b7ae-4a20-87b2-1c10f6e63a05	Instalación completa	7
167	04e1c8b8-edf8-40f3-a823-59d1682868f7	Herramientas de barbería	0
168	04e1c8b8-edf8-40f3-a823-59d1682868f7	Higiene y esterilización	1
169	04e1c8b8-edf8-40f3-a823-59d1682868f7	Cortes clásicos	2
170	04e1c8b8-edf8-40f3-a823-59d1682868f7	Técnica de degradado	3
171	04e1c8b8-edf8-40f3-a823-59d1682868f7	Diseño de barba	4
172	04e1c8b8-edf8-40f3-a823-59d1682868f7	Afeitado con navaja	5
173	04e1c8b8-edf8-40f3-a823-59d1682868f7	Atención al cliente	6
174	04e1c8b8-edf8-40f3-a823-59d1682868f7	Emprender tu barbería	7
175	1f29bb0f-1bc4-4a34-86d1-7fb4cffc0ad2	Anatomía básica	0
176	1f29bb0f-1bc4-4a34-86d1-7fb4cffc0ad2	Principios del entrenamiento	1
177	1f29bb0f-1bc4-4a34-86d1-7fb4cffc0ad2	Rutinas de fuerza	2
178	1f29bb0f-1bc4-4a34-86d1-7fb4cffc0ad2	Cardio y resistencia	3
179	1f29bb0f-1bc4-4a34-86d1-7fb4cffc0ad2	Nutrición deportiva	4
180	1f29bb0f-1bc4-4a34-86d1-7fb4cffc0ad2	Suplementación	5
181	1f29bb0f-1bc4-4a34-86d1-7fb4cffc0ad2	Entrenamiento funcional	6
182	1f29bb0f-1bc4-4a34-86d1-7fb4cffc0ad2	Certificación personal trainer	7
183	94a21f5f-3654-4a91-a5c2-5e515c30cc24	Introducción al detailing	0
184	94a21f5f-3654-4a91-a5c2-5e515c30cc24	Lavado seguro sin rayar	1
185	94a21f5f-3654-4a91-a5c2-5e515c30cc24	Descontaminación química	2
186	94a21f5f-3654-4a91-a5c2-5e515c30cc24	Pulido a máquina	3
187	94a21f5f-3654-4a91-a5c2-5e515c30cc24	Cera y selladores	4
188	94a21f5f-3654-4a91-a5c2-5e515c30cc24	Recubrimiento cerámico	5
189	94a21f5f-3654-4a91-a5c2-5e515c30cc24	Restauración de interiores	6
190	94a21f5f-3654-4a91-a5c2-5e515c30cc24	Armar tu negocio	7
191	f56053c3-ba4a-4302-be96-3b888d6d2154	Manejo de cámara DSLR/Mirrorless	0
192	f56053c3-ba4a-4302-be96-3b888d6d2154	Exposición y triángulo fotográfico	1
193	f56053c3-ba4a-4302-be96-3b888d6d2154	Composición y encuadre	2
194	f56053c3-ba4a-4302-be96-3b888d6d2154	Iluminación natural y artificial	3
195	f56053c3-ba4a-4302-be96-3b888d6d2154	Fotografía de retratos	4
196	f56053c3-ba4a-4302-be96-3b888d6d2154	Fotografía de producto	5
197	f56053c3-ba4a-4302-be96-3b888d6d2154	Edición en Lightroom	6
198	f56053c3-ba4a-4302-be96-3b888d6d2154	Portfolio profesional	7
199	35c967a9-d3f7-428f-a434-e4d769e91216	Fundamentos de seguridad	0
200	35c967a9-d3f7-428f-a434-e4d769e91216	Redes y protocolos	1
201	35c967a9-d3f7-428f-a434-e4d769e91216	Hacking ético	2
202	35c967a9-d3f7-428f-a434-e4d769e91216	Pentesting web	3
203	35c967a9-d3f7-428f-a434-e4d769e91216	Vulnerabilidades OWASP	4
204	35c967a9-d3f7-428f-a434-e4d769e91216	Seguridad en sistemas	5
205	35c967a9-d3f7-428f-a434-e4d769e91216	CTF y práctica real	6
206	35c967a9-d3f7-428f-a434-e4d769e91216	Certificación CEH	7
207	5a6a65f8-829c-4ad9-b2f1-a04df659b9c9	Fundamentos del sonido	0
208	5a6a65f8-829c-4ad9-b2f1-a04df659b9c9	DJ con Serato/Rekordbox	1
209	5a6a65f8-829c-4ad9-b2f1-a04df659b9c9	Mezcla y transiciones	2
210	5a6a65f8-829c-4ad9-b2f1-a04df659b9c9	Producción en FL Studio	3
211	5a6a65f8-829c-4ad9-b2f1-a04df659b9c9	Síntesis y samples	4
212	5a6a65f8-829c-4ad9-b2f1-a04df659b9c9	Masterización básica	5
213	5a6a65f8-829c-4ad9-b2f1-a04df659b9c9	Distribución digital	6
214	5a6a65f8-829c-4ad9-b2f1-a04df659b9c9	Conseguir gigs	7
215	31318f28-6855-47b6-b17c-3cb90ee8eadb	Qué hacer en una emergencia	0
216	31318f28-6855-47b6-b17c-3cb90ee8eadb	RCP en adultos y niños	1
217	31318f28-6855-47b6-b17c-3cb90ee8eadb	Uso del Desfibrilador DAE	2
218	31318f28-6855-47b6-b17c-3cb90ee8eadb	Manejo de heridas y hemorragias	3
219	31318f28-6855-47b6-b17c-3cb90ee8eadb	Fracturas y luxaciones	4
220	31318f28-6855-47b6-b17c-3cb90ee8eadb	Quemaduras y electrocución	5
221	31318f28-6855-47b6-b17c-3cb90ee8eadb	Atragantamiento y maniobra Heimlich	6
222	31318f28-6855-47b6-b17c-3cb90ee8eadb	Plan de emergencia familiar	7
223	0a0c5980-098a-4ea7-898d-df72fc320496	Corriente voltaje y resistencia	0
224	0a0c5980-098a-4ea7-898d-df72fc320496	Componentes electrónicos básicos	1
225	0a0c5980-098a-4ea7-898d-df72fc320496	Lectura de circuitos y esquemas	2
226	0a0c5980-098a-4ea7-898d-df72fc320496	Uso del multímetro	3
227	0a0c5980-098a-4ea7-898d-df72fc320496	Soldadura práctica	4
228	0a0c5980-098a-4ea7-898d-df72fc320496	Introducción a Arduino	5
229	0a0c5980-098a-4ea7-898d-df72fc320496	Proyectos con LED y sensores	6
230	0a0c5980-098a-4ea7-898d-df72fc320496	Reparación de placas electrónicas	7
231	af08a73f-4cf5-49f4-b1c7-c4e78228d81c	Fundamentos de energía solar	0
232	af08a73f-4cf5-49f4-b1c7-c4e78228d81c	Tipos de paneles fotovoltaicos	1
233	af08a73f-4cf5-49f4-b1c7-c4e78228d81c	Cálculo de consumo energético	2
234	af08a73f-4cf5-49f4-b1c7-c4e78228d81c	Inversores y baterías	3
235	af08a73f-4cf5-49f4-b1c7-c4e78228d81c	Instalación en techo residencial	4
236	af08a73f-4cf5-49f4-b1c7-c4e78228d81c	Conexión a red eléctrica	5
237	af08a73f-4cf5-49f4-b1c7-c4e78228d81c	Mantenimiento y limpieza	6
238	af08a73f-4cf5-49f4-b1c7-c4e78228d81c	Normativa y habilitaciones ENRE	7
239	c2a85791-dcae-4a66-93f7-ab848b3a1465	Teoría musical básica	0
240	c2a85791-dcae-4a66-93f7-ab848b3a1465	Técnica vocal y canto	1
241	c2a85791-dcae-4a66-93f7-ab848b3a1465	Guitarra acústica desde cero	2
242	c2a85791-dcae-4a66-93f7-ab848b3a1465	Acordes y melodías en guitarra	3
243	c2a85791-dcae-4a66-93f7-ab848b3a1465	Piano y teclado básico	4
244	c2a85791-dcae-4a66-93f7-ab848b3a1465	Lectura de partituras	5
245	c2a85791-dcae-4a66-93f7-ab848b3a1465	Composición musical propia	6
246	c2a85791-dcae-4a66-93f7-ab848b3a1465	Grabación casera de canciones	7
247	2d6bb9ee-d03f-4689-825c-2a5f2a38fca2	Maquillaje básico y corrección facial	0
248	2d6bb9ee-d03f-4689-825c-2a5f2a38fca2	Maquillaje artístico y fantasía	1
249	2d6bb9ee-d03f-4689-825c-2a5f2a38fca2	Peluquería y técnicas de corte	2
250	2d6bb9ee-d03f-4689-825c-2a5f2a38fca2	Peinados y recogidos profesionales	3
251	2d6bb9ee-d03f-4689-825c-2a5f2a38fca2	Extensiones y lifting de pestañas	4
252	2d6bb9ee-d03f-4689-825c-2a5f2a38fca2	Uñas acrílicas y gel UV	5
253	2d6bb9ee-d03f-4689-825c-2a5f2a38fca2	Colorimetría y tendencias	6
254	2d6bb9ee-d03f-4689-825c-2a5f2a38fca2	Armá tu propio negocio de belleza	7
\.


--
-- Data for Name: courses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.courses (id, category_id, title, slug, description, short_desc, icon, thumbnail_url, intro_video_url, level, duration_hours, price, original_price, is_published, is_featured, has_certificate, lifetime_access, created_at, updated_at) FROM stdin;
df0eac2a-b34a-43ad-a28a-c32f96c98168	1	Reparación de Celulares y Tablets	reparacion-de-celulares-y-tablets	Aprendé a diagnosticar y reparar todo tipo de celulares y tablets. Pantallas, baterías, placas y más.	Aprendé a diagnosticar y reparar todo tipo de celulares y tablets. Pantallas, baterías, placas y más.	📱	https://images.unsplash.com/photo-1601972599720-36938d4ecd31?w=500&q=80	\N	Principiante	30.0	14900	19900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
2a0102a5-ef37-4cdc-9f7f-4ebfd4f9d4c3	1	Técnico de PC	tecnico-de-pc	Armado, mantenimiento y reparación de computadoras de escritorio y notebooks.	Armado, mantenimiento y reparación de computadoras de escritorio y notebooks.	💻	https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=500&q=80	\N	Principiante	25.0	12900	17900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
6621ce4b-8675-4462-94b8-8ced27c2a762	1	Reparación de PS3, PS4 y Consolas	reparacion-de-ps3-ps4-y-consolas	Repará consolas PlayStation, Xbox y más. Diagnóstico, soldadura y reemplazo de componentes.	Repará consolas PlayStation, Xbox y más. Diagnóstico, soldadura y reemplazo de componentes.	🎮	https://images.unsplash.com/photo-1580327344181-c1163234e5a0?w=500&q=80	\N	Intermedio	22.0	13900	18900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
553a3371-5292-40fd-b01e-d3f0916106ea	2	Diseño Gráfico	diseno-grafico	Principios del diseño, tipografía, color, composición y creación de identidad visual profesional.	Principios del diseño, tipografía, color, composición y creación de identidad visual profesional.	🎨	https://images.unsplash.com/photo-1561070791-2526d30994b5?w=500&q=80	\N	Principiante	35.0	15900	22900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
61df0303-2cac-4fcf-8ceb-25ad5e504304	2	Canva Pro	canva-pro	Dominá Canva Pro al 100%. Redes sociales, presentaciones, infografías y más.	Dominá Canva Pro al 100%. Redes sociales, presentaciones, infografías y más.	🖼️	https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=500&q=80	\N	Principiante	15.0	8900	12900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
bb638c3a-bc21-45e6-bfe8-f3b51e3eeb0f	2	CapCut Pro	capcut-pro	El editor favorito para Reels e historias. Dominá CapCut para crear contenido viral.	El editor favorito para Reels e historias. Dominá CapCut para crear contenido viral.	✂️	https://images.unsplash.com/photo-1616763355548-1b606f439f86?w=500&q=80	\N	Principiante	12.0	7900	10900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
d81ae57f-353e-49ce-a50e-2ead77add23a	3	ChatGPT Pro	chatgpt-pro	Usá ChatGPT como un profesional para negocios, marketing, contenido y productividad.	Usá ChatGPT como un profesional para negocios, marketing, contenido y productividad.	🤖	https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=500&q=80	\N	Principiante	20.0	12900	17900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
7442c17d-c360-433b-b776-f8215d858345	3	Gemini Pro	gemini-pro	Google Gemini avanzado para productividad, investigación y creación de contenido.	Google Gemini avanzado para productividad, investigación y creación de contenido.	💎	\N	\N	Principiante	15.0	10900	14900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
1216d2a9-079f-4f87-a3b0-7402357c0f68	3	Inteligencia Artificial Avanzada	inteligencia-artificial-avanzada	Machine Learning, redes neuronales, Python para IA y proyectos reales de AI.	Machine Learning, redes neuronales, Python para IA y proyectos reales de AI.	🧠	https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=500&q=80	\N	Avanzado	50.0	24900	35900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
bff16f1d-5da4-493a-955d-bcdce386b519	4	Facebook, Instagram y TikTok Ads	facebook-instagram-y-tiktok-ads	Dominá la publicidad en las 3 redes más poderosas. Campañas rentables en Meta y TikTok con segmentación avanzada y estrategias que venden.	Dominá la publicidad en las 3 redes más poderosas. Campañas rentables en Meta y TikTok con segmentación avanzada y estrategias que venden.	📱	https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?w=500&q=80	\N	Intermedio	25.0	14900	21900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
9957bf2c-ff03-4161-a800-c807b60c791b	4	Marketing Digital Completo	marketing-digital-completo	Estrategia 360° de marketing digital: SEO, redes, email, contenido y analítica.	Estrategia 360° de marketing digital: SEO, redes, email, contenido y analítica.	📣	https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&q=80	\N	Intermedio	45.0	19900	28900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
3f5c354d-0150-479b-9954-b0f80f6b669e	4	Community Manager	community-manager	Gestioná comunidades online, creá contenido viral y monetizá tu trabajo en redes.	Gestioná comunidades online, creá contenido viral y monetizá tu trabajo en redes.	👥	\N	\N	Principiante	20.0	11900	16900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
bc61301d-2e6d-4dbf-a8f5-f5d79512d574	3	Claude IA	claude-ia	Dominá Claude IA de principiante a experto. Conversaciones inteligentes, análisis, escritura profesional, código y automatización de tareas.	Dominá Claude IA de principiante a experto. Conversaciones inteligentes, análisis, escritura profesional, código y automatización de tareas.	✳️	https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=500&q=80	\N	Principiante	20.0	12900	18900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
8727f0c7-dedf-4584-bd96-f81a51974487	5	Excel Básico a Avanzado	excel-basico-a-avanzado	Desde cero hasta nivel experto. Fórmulas, tablas dinámicas, macros y Power Query.	Desde cero hasta nivel experto. Fórmulas, tablas dinámicas, macros y Power Query.	📊	https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500&q=80	\N	Principiante	25.0	9900	14900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
00044bb7-b612-449f-a38a-5b738b4d8971	5	Inglés Básico a Experto	ingles-basico-a-experto	Aprendé inglés de cero con método moderno. Conversación, gramática y negocios.	Aprendé inglés de cero con método moderno. Conversación, gramática y negocios.	🇬🇧	https://images.unsplash.com/photo-1543269865-cbf427effbad?w=500&q=80	\N	Principiante	60.0	18900	27900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
d68da288-730e-4466-8566-f63ad1a221ec	5	AutoCAD	autocad	Diseño 2D y 3D con AutoCAD. Para arquitectura, ingeniería y diseño industrial.	Diseño 2D y 3D con AutoCAD. Para arquitectura, ingeniería y diseño industrial.	📐	https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=500&q=80	\N	Intermedio	30.0	14900	20900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
626a4b73-051a-4d46-9d94-0063467eb428	6	Trading Básico a Experto	trading-basico-a-experto	Analizá mercados, operá acciones, criptomonedas y forex con estrategias profesionales.	Analizá mercados, operá acciones, criptomonedas y forex con estrategias profesionales.	📈	https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&q=80	\N	Principiante	50.0	15900	24900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
453a959e-295d-46cd-b573-549183c81480	7	Carpintería	carpinteria	Trabajo en madera desde cero. Herramientas, técnicas y proyectos prácticos.	Trabajo en madera desde cero. Herramientas, técnicas y proyectos prácticos.	🪚	https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500&q=80	\N	Principiante	30.0	11900	16900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
89b0fb58-e230-46e6-9278-52dffddbbbaa	7	Instalador de Aire Acondicionado	instalador-de-aire-acondicionado	Instalá, mantenés y reparás equipos de aire acondicionado split y central.	Instalá, mantenés y reparás equipos de aire acondicionado split y central.	❄️	https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80	\N	Intermedio	25.0	13900	19900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
f3747f1d-b7ae-4a20-87b2-1c10f6e63a05	7	Electricista a Domicilio	electricista-a-domicilio	Instalaciones eléctricas residenciales. Tableros, circuitos y normativas de seguridad.	Instalaciones eléctricas residenciales. Tableros, circuitos y normativas de seguridad.	⚡	\N	\N	Principiante	28.0	12900	17900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
04e1c8b8-edf8-40f3-a823-59d1682868f7	7	Barbería Profesional	barberia-profesional	Técnicas de corte, degradado, afeitado y atención al cliente para barberos profesionales.	Técnicas de corte, degradado, afeitado y atención al cliente para barberos profesionales.	💈	https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&q=80	\N	Principiante	20.0	10900	15900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
1f29bb0f-1bc4-4a34-86d1-7fb4cffc0ad2	5	Fitness y Entrenamiento Personal	fitness-y-entrenamiento-personal	Entrenamiento físico desde cero. Rutinas, nutrición, técnicas y cómo ser entrenador personal.	Entrenamiento físico desde cero. Rutinas, nutrición, técnicas y cómo ser entrenador personal.	💪	https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=500&q=80	\N	Principiante	\N	9900	14900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
94a21f5f-3654-4a91-a5c2-5e515c30cc24	7	Estética Vehicular — Detailing Profesional	estetica-vehicular-detailing-profesional	Detailing profesional de autos. Pulido, encerado, nano cerámica, restauración de interiores y más.	Detailing profesional de autos. Pulido, encerado, nano cerámica, restauración de interiores y más.	🚗	https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=500&q=80	\N	Principiante	\N	12900	17900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
f56053c3-ba4a-4302-be96-3b888d6d2154	2	Fotografía Profesional	fotografia-profesional	Desde cero hasta fotografía profesional. Manejo de cámara, iluminación, composición y edición.	Desde cero hasta fotografía profesional. Manejo de cámara, iluminación, composición y edición.	📷	https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=500&q=80	\N	Principiante	\N	11900	16900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
35c967a9-d3f7-428f-a434-e4d769e91216	1	Ciberseguridad	ciberseguridad	Protegé sistemas, redes y datos. Hacking ético, pentesting y seguridad informática profesional.	Protegé sistemas, redes y datos. Hacking ético, pentesting y seguridad informática profesional.	🔒	https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=500&q=80	\N	Intermedio	\N	17900	24900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
5a6a65f8-829c-4ad9-b2f1-a04df659b9c9	2	DJ y Producción Musical	dj-y-produccion-musical	Aprendé a mezclar, producir beats y crear música electrónica desde cero con software profesional.	Aprendé a mezclar, producir beats y crear música electrónica desde cero con software profesional.	🎧	https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=500&q=80	\N	Principiante	\N	13900	19900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
31318f28-6855-47b6-b17c-3cb90ee8eadb	5	Primeros Auxilios	primeros-auxilios	Aprendé a actuar en emergencias médicas. RCP, manejo de heridas, fracturas, quemaduras y situaciones de urgencia vital.	Aprendé a actuar en emergencias médicas. RCP, manejo de heridas, fracturas, quemaduras y situaciones de urgencia vital.	🚑	https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=500&q=80	\N	Principiante	12.0	7900	11900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
0a0c5980-098a-4ea7-898d-df72fc320496	1	Electrónica Básica	electronica-basica	Fundamentos de electrónica desde cero. Circuitos, componentes, soldadura y armado de proyectos electrónicos.	Fundamentos de electrónica desde cero. Circuitos, componentes, soldadura y armado de proyectos electrónicos.	⚡	https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&q=80	\N	Principiante	20.0	10900	15900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
af08a73f-4cf5-49f4-b1c7-c4e78228d81c	7	Paneles Solares — Instalación Profesional	paneles-solares-instalacion-profesional	Instalá sistemas de energía solar fotovoltaica. Paneles, inversores, baterías y conexión a red eléctrica domiciliaria.	Instalá sistemas de energía solar fotovoltaica. Paneles, inversores, baterías y conexión a red eléctrica domiciliaria.	☀️	https://images.unsplash.com/photo-1509391366360-2e959784a276?w=500&q=80	\N	Intermedio	25.0	16900	23900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
c2a85791-dcae-4a66-93f7-ab848b3a1465	2	Música — Canto Guitarra Piano y Composición	musica-canto-guitarra-piano-y-composicion	Aprendé música desde cero. Técnica vocal, guitarra, piano, teoría musical y composición de tus propias canciones.	Aprendé música desde cero. Técnica vocal, guitarra, piano, teoría musical y composición de tus propias canciones.	🎵	https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&q=80	\N	Principiante	30.0	12900	18900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
2d6bb9ee-d03f-4689-825c-2a5f2a38fca2	7	Belleza — Maquillaje Peluquería y Estética	belleza-maquillaje-peluqueria-y-estetica	Todo el mundo de la belleza profesional. Maquillaje artístico, peluquería, peinados, pestañas, uñas acrílicas y más.	Todo el mundo de la belleza profesional. Maquillaje artístico, peluquería, peinados, pestañas, uñas acrílicas y más.	💄	https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=500&q=80	\N	Principiante	28.0	14900	21900	t	f	t	t	2026-09-18 19:30:29.18477+00	2026-09-18 19:30:29.18477+00
\.


--
-- Data for Name: enrollments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.enrollments (id, user_id, course_id, status, enrolled_at, expires_at) FROM stdin;
\.


--
-- Data for Name: lesson_progress; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lesson_progress (id, user_id, lesson_id, course_id, is_completed, watch_seconds, completed_at) FROM stdin;
\.


--
-- Data for Name: lessons; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lessons (id, module_id, course_id, title, description, video_key, video_url, duration_secs, sort_order, is_preview) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_items (id, order_id, course_id, title, price) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, user_id, status, subtotal, discount_amount, total, coupon_code, payment_method, mp_preference_id, mp_payment_id, mp_status, mp_status_detail, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, password, google_id, avatar_url, role, is_active, reset_token, reset_expires, created_at, updated_at) FROM stdin;
\.


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 7, true);


--
-- Name: coupons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.coupons_id_seq', 2, true);


--
-- Name: course_materials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.course_materials_id_seq', 1, false);


--
-- Name: course_modules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.course_modules_id_seq', 1, false);


--
-- Name: course_syllabus_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.course_syllabus_id_seq', 254, true);


--
-- Name: lesson_progress_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.lesson_progress_id_seq', 1, false);


--
-- Name: lessons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.lessons_id_seq', 1, false);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_items_id_seq', 1, false);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: certificates certificates_cert_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_cert_number_key UNIQUE (cert_number);


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_user_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_user_id_course_id_key UNIQUE (user_id, course_id);


--
-- Name: coupons coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: course_materials course_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_pkey PRIMARY KEY (id);


--
-- Name: course_modules course_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_modules
    ADD CONSTRAINT course_modules_pkey PRIMARY KEY (id);


--
-- Name: course_syllabus course_syllabus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_syllabus
    ADD CONSTRAINT course_syllabus_pkey PRIMARY KEY (id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: courses courses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_slug_key UNIQUE (slug);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);


--
-- Name: enrollments enrollments_user_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_user_id_course_id_key UNIQUE (user_id, course_id);


--
-- Name: lesson_progress lesson_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_pkey PRIMARY KEY (id);


--
-- Name: lesson_progress lesson_progress_user_id_lesson_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_user_id_lesson_id_key UNIQUE (user_id, lesson_id);


--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_certs_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_certs_number ON public.certificates USING btree (cert_number);


--
-- Name: idx_courses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_category ON public.courses USING btree (category_id);


--
-- Name: idx_courses_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_published ON public.courses USING btree (is_published);


--
-- Name: idx_courses_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_title_trgm ON public.courses USING gin (title public.gin_trgm_ops);


--
-- Name: idx_enrollments_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollments_course ON public.enrollments USING btree (course_id);


--
-- Name: idx_enrollments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollments_user ON public.enrollments USING btree (user_id);


--
-- Name: idx_lessons_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_course ON public.lessons USING btree (course_id);


--
-- Name: idx_orders_mp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_mp ON public.orders USING btree (mp_payment_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: courses trg_courses_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: orders trg_orders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: certificates certificates_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: certificates certificates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: course_materials course_materials_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_modules course_modules_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_modules
    ADD CONSTRAINT course_modules_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_syllabus course_syllabus_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_syllabus
    ADD CONSTRAINT course_syllabus_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: courses courses_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lesson_progress lesson_progress_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: lesson_progress lesson_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: lesson_progress lesson_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.course_modules(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--


