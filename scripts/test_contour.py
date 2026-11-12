from PIL import Image

port = Image.open('media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg').convert('RGB')
pw, ph = port.size

# For every row y from 0 to ph, find where the subject starts on the left
# Background is (5, 6, 10) with lum ≈ 6.2.
# When lum > 8.5 or color diff > 3, it's subject edge!
face_left = []
for y in range(ph):
    found_x = pw
    for x in range(pw // 2):
        r, g, b = port.getpixel((x, y))
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        if lum > 9.5:
            found_x = x
            break
    face_left.append(found_x)

print('Sample face_left contour at various y:')
for y in range(100, ph, 100):
    print(f'y={y}: face_left={face_left[y]}')
