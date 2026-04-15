-- =============================================================
-- Txoko — Imagens de demo para os produtos do restaurante demo
-- Usa URLs publicas (Unsplash) apenas para populacao visual inicial.
-- Em producao, imagens reais sao enviadas via Storage.
-- =============================================================

update products set image_url = 'https://images.unsplash.com/photo-1541833000669-9b1f3b1e5a74?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Bolinho de Bacalhau';
update products set image_url = 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Pao de Alho';
update products set image_url = 'https://images.unsplash.com/photo-1604011237320-8c1a8de96b4e?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Ceviche';
update products set image_url = 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Picanha na Brasa';
update products set image_url = 'https://images.unsplash.com/photo-1633436375153-d7045cbbb0fc?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Risoto de Camarao';
update products set image_url = 'https://images.unsplash.com/photo-1625938145744-533e82c2e009?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Bacalhau a Braz';
update products set image_url = 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Pudim da Casa';
update products set image_url = 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Petit Gateau';
update products set image_url = 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Caipirinha';
update products set image_url = 'https://images.unsplash.com/photo-1546171753-97d7676e4602?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Suco Natural';
update products set image_url = 'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=800&q=80'
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and name = 'Agua Mineral';
