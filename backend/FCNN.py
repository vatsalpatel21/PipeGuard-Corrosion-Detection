import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2 # type: ignore
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout # type: ignore
from tensorflow.keras.models import Model # type: ignore
from tensorflow.keras.preprocessing.image import ImageDataGenerator # type: ignore
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau # type: ignore
from sklearn.utils import class_weight
from sklearn.metrics import confusion_matrix, classification_report
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns

# --- 1. SETTINGS & DATA LOADERS ---
IMG_SIZE = (224, 224)
BATCH_SIZE = 8
TRAIN_DIR = r"D:\NUV\VIDEOS\COMPUTER\sem6\CV\Pipeline Corrosion Detection\train"

# Data Augmentation (Training)
train_datagen = ImageDataGenerator(
    rescale=1./255, 
    validation_split=0.2, 
    rotation_range=30, 
    zoom_range=0.3, 
    horizontal_flip=True
)

# Validation/Testing (No augmentation, only rescaling)
val_datagen = ImageDataGenerator(rescale=1./255, validation_split=0.2)

train_data = train_datagen.flow_from_directory(
    TRAIN_DIR, target_size=IMG_SIZE, batch_size=BATCH_SIZE, 
    class_mode="categorical", subset="training"
)

val_data = val_datagen.flow_from_directory(
    TRAIN_DIR, target_size=IMG_SIZE, batch_size=BATCH_SIZE, 
    class_mode="categorical", subset="validation", shuffle=False # SHUFFLE OFF FOR EVAL
)

# Improvement: Calculate Class Weights to handle imbalance
weights = class_weight.compute_class_weight(
    'balanced', classes=np.unique(train_data.classes), y=train_data.classes
)
dict_weights = dict(enumerate(weights))

# --- 2. MODEL ARCHITECTURE ---
base_model = MobileNetV2(weights="imagenet", include_top=False, input_shape=(224,224,3))
base_model.trainable = False  # Freeze base layers initially

x = GlobalAveragePooling2D()(base_model.output)
x = Dense(128, activation='relu')(x)
x = Dropout(0.5)(x)
predictions = Dense(3, activation='softmax')(x)

model = Model(inputs=base_model.input, outputs=predictions)

# Callbacks for better convergence
callbacks = [
    EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True),
    ReduceLROnPlateau(monitor='val_loss', factor=0.2, patience=3, min_lr=1e-6)
]

# --- 3. TRAINING PHASE ---
# Initial Training (Label Smoothing enabled)
model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-4),
    loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
    metrics=["accuracy"]
)

print("Starting Initial Training...")
model.fit(train_data, epochs=25, validation_data=val_data, 
          class_weight=dict_weights, callbacks=callbacks)

# Fine-Tuning (Unfreeze top 20 layers)
print("Starting Fine-Tuning...")
base_model.trainable = True
for layer in base_model.layers[:-20]:
    layer.trainable = False

model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-5),
    loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
    metrics=["accuracy"]
)

model.fit(train_data, epochs=10, validation_data=val_data, 
          class_weight=dict_weights, callbacks=callbacks)

model.save(r"D:\NUV\VIDEOS\COMPUTER\sem6\corrosion_leakage_model.keras")

# --- 4. FINAL EVALUATION & PLOTTING ---
print("\nGenerating Final Evaluation Reports...")
val_data.reset() # Ensure we start from the first image
Y_pred = model.predict(val_data)
y_pred = np.argmax(Y_pred, axis=1)
y_true = val_data.classes

# Generate Confusion Matrix
cm = confusion_matrix(y_true, y_pred)

plt.figure(figsize=(8, 6))
sns.heatmap(cm, annot=True, fmt='d', 
            xticklabels=list(val_data.class_indices.keys()),
            yticklabels=list(val_data.class_indices.keys()), 
            cmap='Blues')

plt.xlabel('Predicted')
plt.ylabel('Actual')
plt.title('PipeGuard AI: Final Confusion Matrix')
plt.savefig(r"D:\NUV\VIDEOS\COMPUTER\sem6\confusion_matrix_final.png")
plt.show()

# Print Comprehensive Classification Report
print("\nClassification Report:")
print(classification_report(y_true, y_pred, target_names=list(val_data.class_indices.keys())))